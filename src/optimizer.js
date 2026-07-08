/**
 * AI Prompt Optimizer Engine
 * 
 * Based on ralph-playbook principles:
 * - Markdown is preferred over JSON (less tokens)
 * - Strip out unnecessary whitespace
 * - Ensure system instructions/static files are at the top to hit Prompt Caching
 * - Phase 2: Semantic Compression for massive context blocks
 */
import fetch from 'node-fetch';

export async function optimizePrompt(payload, useSemanticCompression = false) {
    const originalTokens = estimateTokens(JSON.stringify(payload));
    
    // 1. Reorder context if it's a messages array (for Claude/GPT)
    let optimizedPayload = { ...payload };

    if (Array.isArray(optimizedPayload.messages)) {
        optimizedPayload.messages = reorderMessages(optimizedPayload.messages);
        
        // 2. Semantic Compression (Deep Diet)
        if (useSemanticCompression && originalTokens > 8000) {
            optimizedPayload.messages = await compressMessagesSemantically(optimizedPayload.messages);
        } else {
            optimizedPayload.messages = minifyMessages(optimizedPayload.messages);
        }
        
        // 3. Automated Prompt Caching Injection (specifically for Anthropic structure)
        optimizedPayload.messages = injectCacheControl(optimizedPayload.messages);
        
    } else if (typeof optimizedPayload.prompt === 'string') {
        if (useSemanticCompression && originalTokens > 8000) {
            optimizedPayload.prompt = await summarizeTextWithOllama(optimizedPayload.prompt);
        } else {
            optimizedPayload.prompt = minifyText(optimizedPayload.prompt);
        }
    }

    const optimizedTokens = estimateTokens(JSON.stringify(optimizedPayload));

    return {
        optimizedPayload,
        originalTokens,
        optimizedTokens
    };
}

function reorderMessages(messages) {
    const systemMsgs = messages.filter(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');

    // Simple reorder: System first, then past conversation, then latest user message
    return [...systemMsgs, ...assistantMsgs, ...userMsgs];
}

function minifyMessages(messages) {
    return messages.map(msg => {
        if (typeof msg.content === 'string') {
            msg.content = minifyText(msg.content);
        } else if (Array.isArray(msg.content)) {
            msg.content = msg.content.map(part => {
                if (part.type === 'text') part.text = minifyText(part.text);
                return part;
            });
        }
        return msg;
    });
}

function injectCacheControl(messages) {
    // Anthropic supports up to 4 cache breakpoints. We inject it on the largest chunks.
    // For safety, we just inject it on the last system message (if any)
    // and the second to last user message (which is often a large history block).
    
    let injected = JSON.parse(JSON.stringify(messages)); // Deep clone
    
    const systemMsgs = injected.filter(m => m.role === 'system');
    if (systemMsgs.length > 0) {
        const lastSystem = systemMsgs[systemMsgs.length - 1];
        convertToCacheable(lastSystem);
    }
    
    const userMsgs = injected.filter(m => m.role === 'user');
    if (userMsgs.length > 1) {
        const historyBlock = userMsgs[userMsgs.length - 2];
        convertToCacheable(historyBlock);
    }

    return injected;
}

function convertToCacheable(msg) {
    if (typeof msg.content === 'string') {
        msg.content = [
            { type: "text", text: msg.content, cache_control: { type: "ephemeral" } }
        ];
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
        msg.content[msg.content.length - 1].cache_control = { type: "ephemeral" };
    }
}

async function compressMessagesSemantically(messages) {
    // We only compress 'user' messages that are very long (likely containing raw documentation/code)
    const compressed = [];
    for (const msg of messages) {
        if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.length > 2000) {
            const summary = await summarizeTextWithOllama(msg.content);
            compressed.push({ ...msg, content: summary });
        } else {
            // Standard minification for smaller msgs
            let minified = { ...msg };
            if (typeof msg.content === 'string') {
                minified.content = minifyText(msg.content);
            }
            compressed.push(minified);
        }
    }
    return compressed;
}

async function summarizeTextWithOllama(text) {
    console.log("Triggering Deep Semantic Compression via local Ollama...");
    try {
        const prompt = `You are a strict text compressor. Summarize the following context, retaining ONLY the highly technical details, API endpoints, variable names, and code structures. Remove all conversational fluff, introductions, and generic explanations. Output in dense Markdown.\n\nContext to compress:\n${text}`;
        
        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                model: 'llama3.2', // Assumes a standard fast local model like llama 3.2
                prompt: prompt, 
                stream: false 
            })
        });
        
        if (!res.ok) throw new Error("Ollama unavailable");
        const data = await res.json();
        return data.response;
    } catch (err) {
        console.error("Semantic compression failed, falling back to basic minification:", err.message);
        return minifyText(text);
    }
}

function minifyText(text) {
    // Basic minification:
    // - Remove extra empty lines
    // - Trim trailing whitespace
    // - Remove consecutive spaces (careful with code blocks, but for general text it's fine. We'll stick to safe trims)
    return text
        .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n');
}

// Very basic token estimator (1 token ~= 4 characters)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
