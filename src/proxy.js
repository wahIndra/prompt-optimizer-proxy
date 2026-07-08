import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDB, logRequest, getStats, getLogs } from './db.js';
import { optimizePrompt } from './optimizer.js';
import { routeToProvider, getAvailableModels } from './providers.js';
import { getConfig, setConfig } from './config.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files for the dashboard
app.use(express.static(path.join(process.cwd(), 'public')));

// Initialize DB on start
await initDB();

async function processRequest(provider, model, payload, useSemanticCompression, dynamicApiKey, res) {
    // 1. Optimize the prompt
    const { optimizedPayload, originalTokens, optimizedTokens } = await optimizePrompt(payload, useSemanticCompression);

    // 2. Route to Provider
    const { responseData, completionTokens, cachedTokens, latencyMs, costUsd } = await routeToProvider(provider, model, optimizedPayload, dynamicApiKey);

    // 3. Log usage asynchronously
    const PRICING = {
        'gpt-4o': { prompt: 0.005, completion: 0.015, cached: 0.0025 },
        'claude-3-5-sonnet-20240620': { prompt: 0.003, completion: 0.015, cached: 0.0003 },
        'gemini-1.5-pro': { prompt: 0.0035, completion: 0.0105, cached: 0.000875 },
        'ollama': { prompt: 0, completion: 0, cached: 0 }
    };
    
    const uncachedPromptTokens = Math.max(0, optimizedTokens - cachedTokens);
    
    const pPrice = (PRICING[model]?.prompt || 0) * (uncachedPromptTokens / 1000);
    const cPrice = (PRICING[model]?.cached || 0) * (cachedTokens / 1000);
    const totalCostUsd = costUsd + pPrice + cPrice;

    logRequest({
        provider,
        model,
        originalPromptTokens: originalTokens,
        optimizedPromptTokens: optimizedTokens,
        cachedPromptTokens: cachedTokens,
        completionTokens, // Will be 0 for streams initially
        costUsd: totalCostUsd, // Prompt cost is still calculated
        latencyMs
    }).catch(err => console.error("Failed to log request:", err));

    // 4. Send response
    if (payload.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        responseData.pipe(res);
    } else {
        res.json(responseData);
    }
}

// Main Proxy Endpoint (Custom format)
app.post('/api/chat', async (req, res) => {
    try {
        const { provider = 'openai', model, payload, useSemanticCompression = true } = req.body;
        if (!model || !payload) return res.status(400).json({ error: "Missing model or payload" });
        
        await processRequest(provider, model, payload, useSemanticCompression, null, res);
    } catch (err) {
        console.error("Proxy error:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// Transparent IDE Endpoint: OpenAI format
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const payload = req.body;
        const model = payload.model;
        if (!model) return res.status(400).json({ error: "Missing model" });

        // Extract API Key
        const authHeader = req.headers['authorization'] || '';
        const dynamicApiKey = authHeader.replace('Bearer ', '').trim();
        
        // Decide provider based on model name, default to openai
        let provider = model.toLowerCase().includes('llama') ? 'ollama' : 'openai';
        
        // Google models
        if (model.toLowerCase().includes('gemini')) provider = 'gemini';
        
        // Override model if user configured a default
        let finalModel = model;
        if (provider === 'openai' && getConfig("OPENAI_DEFAULT_MODEL")) finalModel = getConfig("OPENAI_DEFAULT_MODEL");
        if (provider === 'gemini' && getConfig("GEMINI_DEFAULT_MODEL")) finalModel = getConfig("GEMINI_DEFAULT_MODEL");
        if (provider === 'ollama' && getConfig("OLLAMA_DEFAULT_MODEL")) finalModel = getConfig("OLLAMA_DEFAULT_MODEL");
        
        payload.model = finalModel;
        
        const useSemantic = payload.useSemanticCompression === true;
        
        await processRequest(provider, finalModel, payload, useSemantic, dynamicApiKey, res);
    } catch (err) {
        console.error("Proxy error:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// Transparent IDE Endpoint: Anthropic format
app.post('/v1/messages', async (req, res) => {
    try {
        const payload = req.body;
        const model = payload.model;
        if (!model) return res.status(400).json({ error: "Missing model" });

        const dynamicApiKey = req.headers['x-api-key'];
        const provider = 'anthropic';
        
        // Override model if user configured a default
        let finalModel = model;
        if (getConfig("ANTHROPIC_DEFAULT_MODEL")) finalModel = getConfig("ANTHROPIC_DEFAULT_MODEL");
        
        payload.model = finalModel;
        
        await processRequest(provider, finalModel, payload, false, dynamicApiKey, res);
    } catch (err) {
        console.error("Proxy error:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// Dashboard API Endpoints
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
        const logs = await getLogs(limit);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/config', (req, res) => {
    try {
        const config = getConfig();
        // Mask keys
        const masked = {};
        for (const [k, v] of Object.entries(config)) {
            masked[k] = v.length > 8 ? v.substring(0, 4) + '...' + v.substring(v.length - 4) : '***';
        }
        res.json(masked);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/config', (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || !value) return res.status(400).json({ error: "Missing key or value" });
        if (setConfig(key, value)) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: "Failed to save config" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 AI Prompt Optimizer Proxy running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}/index.html`);
});

app.get("/v1/models", async (req, res) => {
    try {
        const models = await getAvailableModels();
        res.json(models);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

