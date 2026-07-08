import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

// Create data directory if it doesn't exist
const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'tokens.db');
const db = new sqlite3.Database(DB_PATH);

const run = promisify(db.run.bind(db));
const all = promisify(db.all.bind(db));
const get = promisify(db.get.bind(db));

// Initialize schema
export async function initDB() {
    await run(`
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            original_prompt_tokens INTEGER,
            optimized_prompt_tokens INTEGER,
            cached_prompt_tokens INTEGER,
            completion_tokens INTEGER,
            cost_usd REAL,
            latency_ms INTEGER
        )
    `);
    console.log('Database initialized.');
}

// Log a request
export async function logRequest({ provider, model, originalPromptTokens, optimizedPromptTokens, cachedPromptTokens, completionTokens, costUsd, latencyMs }) {
    await run(
        `INSERT INTO requests 
        (provider, model, original_prompt_tokens, optimized_prompt_tokens, cached_prompt_tokens, completion_tokens, cost_usd, latency_ms) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [provider, model, originalPromptTokens, optimizedPromptTokens, cachedPromptTokens, completionTokens, costUsd, latencyMs]
    );
}

// Get stats for the dashboard
export async function getStats() {
    const totalTokens = await get(`SELECT SUM(optimized_prompt_tokens + completion_tokens) as total FROM requests`);
    const totalCost = await get(`SELECT SUM(cost_usd) as total FROM requests`);
    const savedTokens = await get(`SELECT SUM(original_prompt_tokens - optimized_prompt_tokens) as total FROM requests`);
    
    // Group by provider
    const providerStats = await all(`
        SELECT provider, COUNT(*) as request_count, SUM(cost_usd) as total_cost 
        FROM requests 
        GROUP BY provider
    `);

    // Recent requests
    const recentRequests = await all(`
        SELECT * FROM requests 
        ORDER BY timestamp DESC 
        LIMIT 20
    `);

    // Tokens over time (daily)
    const timeSeries = await all(`
        SELECT date(timestamp) as day, SUM(optimized_prompt_tokens + completion_tokens) as tokens 
        FROM requests 
        GROUP BY day 
        ORDER BY day ASC
    `);

    return {
        totalTokens: totalTokens.total || 0,
        totalCost: totalCost.total || 0,
        savedTokens: savedTokens.total || 0,
        providerStats,
        recentRequests,
        timeSeries
    };
}

// Get full logs for the audit trail
export async function getLogs(limit = 100) {
    const rows = await all(`SELECT * FROM requests ORDER BY timestamp DESC LIMIT ?`, [limit]);
    return rows;
}
