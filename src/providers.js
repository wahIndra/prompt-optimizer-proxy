import fetch from 'node-fetch';
import 'dotenv/config';
import { getConfig } from './config.js';

// Prices per 1K tokens (estimates)
const PRICING = {
    'gpt-4o': { prompt: 0.005, completion: 0.015 },
    'claude-3-5-sonnet-20240620': { prompt: 0.003, completion: 0.015 },
    'gemini-1.5-pro': { prompt: 0.0035, completion: 0.0105 },
    'ollama': { prompt: 0, completion: 0 } // Local is free
};

export async function routeToProvider(provider, model, payload, dynamicApiKey = null) {
    const startTime = Date.now();
    let responseData = null;
    let completionTokens = 0;
    let cachedTokens = 0;
    
    try {
        switch (provider.toLowerCase()) {
            case 'openai':
                responseData = await callOpenAI(model, payload, dynamicApiKey);
                completionTokens = responseData.usage?.completion_tokens || 0;
                break;
            case 'anthropic':
                responseData = await callAnthropic(model, payload, dynamicApiKey);
                completionTokens = responseData.usage?.output_tokens || 0;
                cachedTokens = responseData.usage?.cache_read_input_tokens || 0;
                break;
            case 'gemini':
                responseData = await callGemini(model, payload, dynamicApiKey);
                // Basic mock usage for Gemini if not provided
                completionTokens = responseData.usageMetadata?.candidatesTokenCount || 0;
                break;
            case 'ollama':
                responseData = await callOllama(model, payload);
                completionTokens = responseData.eval_count || 0;
                break;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    } catch (e) {
        console.error(`Error calling ${provider}:`, e.message);
        throw e;
    }

    const latencyMs = Date.now() - startTime;
    
    // Calculate cost
    const pricing = PRICING[model] || { prompt: 0, completion: 0 };
    // Cost formula: (tokens / 1000) * price
    const costUsd = (completionTokens / 1000) * pricing.completion;

    return { responseData, completionTokens, cachedTokens, latencyMs, costUsd };
}

async function callOpenAI(model, payload, dynamicApiKey) {
    const apiKey = dynamicApiKey || getConfig('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    if (payload.stream) {
        payload.stream_options = { include_usage: true };
    }
    let baseUrl = getConfig('OPENAI_BASE_URL') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    baseUrl = baseUrl.replace(/\/$/, '');
    
    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, ...payload })
    });
    return payload.stream ? res.body : res.json();
}

async function callAnthropic(model, payload, dynamicApiKey) {
    const apiKey = dynamicApiKey || getConfig('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
    let baseUrl = getConfig('ANTHROPIC_BASE_URL') || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    baseUrl = baseUrl.replace(/\/$/, '');
    
    const res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens: 4096, ...payload })
    });
    return payload.stream ? res.body : res.json();
}

async function callGemini(model, payload, dynamicApiKey) {
    const apiKey = dynamicApiKey || getConfig('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    let baseUrl = getConfig('GEMINI_BASE_URL') || process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    baseUrl = baseUrl.replace(/\/$/, '');
    
    const endpoint = payload.stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
    const res = await fetch(`${baseUrl}/models/${model}:${endpoint}key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return payload.stream ? res.body : res.json();
}

async function callOllama(model, payload) {
    const isStream = payload.stream === true;
    let ollamaHost = getConfig('OLLAMA_HOST') || process.env.OLLAMA_HOST || 'http://localhost:11434';
    // Ensure no trailing slash
    ollamaHost = ollamaHost.replace(/\/$/, '');
    const ollamaKey = getConfig('OLLAMA_API_KEY') || process.env.OLLAMA_API_KEY;
    const headers = { 'Content-Type': 'application/json' };
    if (ollamaKey) {
        headers['Authorization'] = `Bearer ${ollamaKey}`;
    }
    
    const res = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ model, messages: payload.messages, stream: isStream })
    });
    return isStream ? res.body : res.json();
}

export async function getAvailableModels() {
    const models = [];
    
    // 1. OpenAI
    try {
        const key = getConfig("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
        let baseUrl = getConfig("OPENAI_BASE_URL") || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
        baseUrl = baseUrl.replace(/\/$/, "");
        
        if (key) {
            const res = await fetch(`${baseUrl}/models`, {
                headers: { "Authorization": `Bearer ${key}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.data && Array.isArray(data.data)) {
                    data.data.forEach(m => models.push({ id: m.id, object: "model", owned_by: "openai", provider: "openai" }));
                }
            }
        }
    } catch (e) { console.error("OpenAI models error:", e.message); }

    // 2. Anthropic (Hardcoded as they lack an endpoint)
    models.push(
        { id: "claude-3-5-sonnet-20240620", object: "model", owned_by: "anthropic", provider: "anthropic" },
        { id: "claude-3-opus-20240229", object: "model", owned_by: "anthropic", provider: "anthropic" },
        { id: "claude-3-haiku-20240307", object: "model", owned_by: "anthropic", provider: "anthropic" }
    );

    // 3. Gemini
    try {
        const key = getConfig("GEMINI_API_KEY") || process.env.GEMINI_API_KEY;
        let baseUrl = getConfig("GEMINI_BASE_URL") || process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
        baseUrl = baseUrl.replace(/\/$/, "");
        
        if (key) {
            const res = await fetch(`${baseUrl}/models?key=${key}`);
            if (res.ok) {
                const data = await res.json();
                if (data.models && Array.isArray(data.models)) {
                    data.models.forEach(m => models.push({ id: m.name.replace("models/", ""), object: "model", owned_by: "google", provider: "gemini" }));
                }
            }
        }
    } catch (e) { console.error("Gemini models error:", e.message); }

    // 4. Ollama
    try {
        let ollamaHost = getConfig("OLLAMA_HOST") || process.env.OLLAMA_HOST || "http://localhost:11434";
        ollamaHost = ollamaHost.replace(/\/$/, "");
        const ollamaKey = getConfig("OLLAMA_API_KEY") || process.env.OLLAMA_API_KEY;
        const headers = {};
        if (ollamaKey) headers["Authorization"] = `Bearer ${ollamaKey}`;
        
        const res = await fetch(`${ollamaHost}/api/tags`, { headers });
        if (res.ok) {
            const data = await res.json();
            if (data.models && Array.isArray(data.models)) {
                data.models.forEach(m => models.push({ id: m.name, object: "model", owned_by: "ollama", provider: "ollama" }));
            }
        }
    } catch (e) { console.error("Ollama models error:", e.message); }

    return { object: "list", data: models };
}
