// Configuration
Chart.defaults.color = '#9BA4B5';
Chart.defaults.font.family = "'Outfit', sans-serif";

let usageChartInstance = null;
let providerChartInstance = null;

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        updateDashboard(data);
    } catch (err) {
        console.error("Failed to fetch stats", err);
    }
}

function updateDashboard(data) {
    // 1. Update Top Stats
    document.getElementById('stat-total-tokens').innerText = data.totalTokens.toLocaleString();
    document.getElementById('stat-saved-tokens').innerText = data.savedTokens.toLocaleString();
    document.getElementById('stat-total-cost').innerText = '$' + data.totalCost.toFixed(4);

    // 2. Update Charts
    updateUsageChart(data.timeSeries);
    updateProviderChart(data.providerStats);

    // 3. Update Table
    updateTable(data.recentRequests);
}

function updateUsageChart(timeSeries) {
    const ctx = document.getElementById('usageChart').getContext('2d');
    
    const labels = timeSeries.map(d => d.day);
    const dataPoints = timeSeries.map(d => d.tokens);

    if (usageChartInstance) {
        usageChartInstance.data.labels = labels;
        usageChartInstance.data.datasets[0].data = dataPoints;
        usageChartInstance.update();
        return;
    }

    usageChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tokens Processed',
                data: dataPoints,
                borderColor: '#6366F1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateProviderChart(providerStats) {
    const ctx = document.getElementById('providerChart').getContext('2d');
    
    const labels = providerStats.map(p => p.provider);
    const dataPoints = providerStats.map(p => p.request_count);
    
    const colors = {
        'openai': '#10A37F',
        'anthropic': '#D4AC8E',
        'gemini': '#4285F4',
        'ollama': '#FFFFFF'
    };

    const bgColors = labels.map(l => colors[l.toLowerCase()] || '#8B5CF6');

    if (providerChartInstance) {
        providerChartInstance.data.labels = labels;
        providerChartInstance.data.datasets[0].data = dataPoints;
        providerChartInstance.data.datasets[0].backgroundColor = bgColors;
        providerChartInstance.update();
        return;
    }

    providerChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                backgroundColor: bgColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function updateTable(requests) {
    const tbody = document.getElementById('requests-body');
    tbody.innerHTML = '';

    requests.forEach(req => {
        const tr = document.createElement('tr');
        
        const date = new Date(req.timestamp).toLocaleString();
        const saved = req.original_prompt_tokens - req.optimized_prompt_tokens;
        
        tr.innerHTML = `
            <td>${date}</td>
            <td><span class="badge ${req.provider.toLowerCase()}">${req.provider}</span></td>
            <td>${req.model}</td>
            <td style="color: #10B981">+${saved.toLocaleString()}</td>
            <td style="color: #06B6D4">${req.cached_prompt_tokens.toLocaleString()}</td>
            <td>$${req.cost_usd.toFixed(5)}</td>
            <td>${req.latency_ms}ms</td>
        `;
        tbody.appendChild(tr);
    });
}

// Initial load
fetchStats();

// Refresh button
document.getElementById('refresh-btn').addEventListener('click', fetchStats);

// Auto-refresh every 10 seconds
setInterval(fetchStats, 10000);

// SPA Routing
const navBtns = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        // Update active class on nav
        navBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Show target view
        const targetId = btn.getAttribute("data-target");
        views.forEach(v => {
            v.classList.remove("active");
            if(v.id === targetId) v.classList.add("active");
        });

        // Trigger view-specific loads
        if (targetId === "view-audit") fetchAuditLogs();
        if (targetId === "view-settings") fetchConfig();
    });
});

// Audit Trail Logic
async function fetchAuditLogs() {
    try {
        const res = await fetch("/api/logs?limit=100");
        const logs = await res.json();
        const tbody = document.getElementById("audit-body");
        tbody.innerHTML = "";
        
        logs.forEach(req => {
            const tr = document.createElement("tr");
            const date = new Date(req.timestamp).toLocaleString();
            tr.innerHTML = `
                <td>${req.id}</td>
                <td>${date}</td>
                <td><span class="badge ${req.provider.toLowerCase()}">${req.provider}</span></td>
                <td>${req.model}</td>
                <td>${req.original_prompt_tokens}</td>
                <td style="color: #10B981">${req.optimized_prompt_tokens}</td>
                <td style="color: #06B6D4">${req.cached_prompt_tokens}</td>
                <td>${req.completion_tokens}</td>
                <td>$${req.cost_usd.toFixed(5)}</td>
                <td>${req.latency_ms}ms</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to fetch audit logs", err);
    }
}

document.getElementById("refresh-logs-btn").addEventListener("click", fetchAuditLogs);

// Settings & Modal Logic
let globalConfig = {};
let currentModalProvider = null;

async function fetchConfig() {
    try {
        const res = await fetch("/api/config");
        globalConfig = await res.json();
    } catch (err) {
        console.error("Failed to fetch config", err);
    }
}

// Modal Elements
const modalOverlay = document.getElementById("config-modal");
const modalClose = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");
const modalKeyInput = document.getElementById("modal-key-input");
const modalUrlInput = document.getElementById("modal-url-input");
const modalStatus = document.getElementById("modal-status");
const modalSaveBtn = document.getElementById("modal-save-btn");

const providerMap = {
    'openai': { title: 'Configure OpenAI', keyVar: 'OPENAI_API_KEY', urlVar: 'OPENAI_BASE_URL', modelVar: 'OPENAI_DEFAULT_MODEL' },
    'anthropic': { title: 'Configure Anthropic', keyVar: 'ANTHROPIC_API_KEY', urlVar: 'ANTHROPIC_BASE_URL', modelVar: 'ANTHROPIC_DEFAULT_MODEL' },
    'gemini': { title: 'Configure Gemini', keyVar: 'GEMINI_API_KEY', urlVar: 'GEMINI_BASE_URL', modelVar: 'GEMINI_DEFAULT_MODEL' },
    'ollama': { title: 'Configure Ollama', keyVar: 'OLLAMA_API_KEY', urlVar: 'OLLAMA_HOST', modelVar: 'OLLAMA_DEFAULT_MODEL' }
};

// Open Modal
document.querySelectorAll(".provider-card").forEach(card => {
    card.addEventListener("click", (e) => {
        // Prevent triggering if they didn't click the button or the card directly
        const provider = card.getAttribute("data-provider");
        currentModalProvider = providerMap[provider];
        
        modalTitle.innerText = currentModalProvider.title;
        
        // Reset Inputs & Status
        modalKeyInput.value = "";
        modalUrlInput.value = globalConfig[currentModalProvider.urlVar] || "";
        modalKeyInput.placeholder = globalConfig[currentModalProvider.keyVar] ? globalConfig[currentModalProvider.keyVar] : "sk-...";
        modalStatus.className = "";
        modalStatus.innerText = "";
        
        modalOverlay.classList.add("active");
        
        // Fetch and display models
        const modelSelectEl = document.getElementById("modal-model-select");
        modelSelectEl.innerHTML = '<option value="">Testing connection & fetching models...</option>';
        
        fetch("/v1/models")
            .then(res => res.json())
            .then(data => {
                const models = data.data.filter(m => m.provider === provider);
                if (models.length > 0) {
                    let html = '<option value="">No model override</option>';
                    html += models.map(m => {
                        const selected = (globalConfig[currentModalProvider.modelVar] === m.id) ? 'selected' : '';
                        return `<option value="${m.id}" ${selected}>${m.id}</option>`;
                    }).join('');
                    modelSelectEl.innerHTML = html;
                } else {
                    modelSelectEl.innerHTML = '<option value="">No models found. Check your API Key/Host.</option>';
                }
            })
            .catch(err => {
                modelSelectEl.innerHTML = '<option value="">Failed to fetch models.</option>';
            });
    });
});

// Close Modal
function closeModal() {
    modalOverlay.classList.remove("active");
    currentModalProvider = null;
}
modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
    if(e.target === modalOverlay) closeModal();
});

// Save Logic
modalSaveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if(!currentModalProvider) return;
    
    const keyValue = modalKeyInput.value.trim();
    const urlValue = modalUrlInput.value.trim();
    const modelValue = document.getElementById("modal-model-select").value;
    
    modalStatus.className = "";
    modalStatus.innerText = "Saving...";
    
    try {
        let successCount = 0;
        
        // Save Key if provided
        if (keyValue) {
            const resKey = await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: currentModalProvider.keyVar, value: keyValue })
            });
            const dataKey = await resKey.json();
            if (dataKey.success) successCount++;
        }
        
        // Save URL if provided (or overwrite with blank to reset)
        const resUrl = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: currentModalProvider.urlVar, value: urlValue })
        });
        const dataUrl = await resUrl.json();
        if (dataUrl.success) successCount++;
        
        // Save Default Model
        const resModel = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: currentModalProvider.modelVar, value: modelValue })
        });
        const dataModel = await resModel.json();
        if (dataModel.success) successCount++;
        
        if (successCount > 0) {
            modalStatus.innerText = "Configuration saved successfully!";
            modalStatus.className = "success";
            await fetchConfig(); // Refresh local cache
            modalKeyInput.value = "";
            modalKeyInput.placeholder = globalConfig[currentModalProvider.keyVar] ? globalConfig[currentModalProvider.keyVar] : "sk-...";
            
            // Re-fetch models to show instant feedback
            const modelSelectEl = document.getElementById("modal-model-select");
            modelSelectEl.innerHTML = '<option value="">Testing connection & fetching models...</option>';
            
            fetch("/v1/models")
                .then(res => res.json())
                .then(data => {
                    const provider = currentModalProvider === providerMap.openai ? 'openai' :
                                     currentModalProvider === providerMap.anthropic ? 'anthropic' :
                                     currentModalProvider === providerMap.gemini ? 'gemini' : 'ollama';
                    const models = data.data.filter(m => m.provider === provider);
                    if (models.length > 0) {
                        let html = '<option value="">No model override</option>';
                        html += models.map(m => {
                            const selected = (globalConfig[currentModalProvider.modelVar] === m.id) ? 'selected' : '';
                            return `<option value="${m.id}" ${selected}>${m.id}</option>`;
                        }).join('');
                        modelSelectEl.innerHTML = html;
                    } else {
                        modelSelectEl.innerHTML = '<option value="">No models found. Check your API Key/Host.</option>';
                    }
                })
                .catch(err => {
                    modelSelectEl.innerHTML = '<option value="">Failed to fetch models.</option>';
                });
        }
    } catch (err) {
        modalStatus.innerText = "Network error while saving.";
        modalStatus.className = "error";
    }
});


// ==========================================
// PLAYGROUND LOGIC
// ==========================================
let playgroundMessages = [];

const chatHistoryEl = document.getElementById("chat-history");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const pgClearBtn = document.getElementById("pg-clear-btn");
const pgSaved = document.getElementById("pg-saved");
const pgCost = document.getElementById("pg-cost");

function appendMessage(role, content) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.innerText = content;
    
    msgDiv.appendChild(contentDiv);
    chatHistoryEl.appendChild(msgDiv);
    
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    return contentDiv;
}

async function sendPlaygroundMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Add user message to UI
    appendMessage("user", text);
    chatInput.value = "";
    
    // Add to state
    playgroundMessages.push({ role: "user", content: text });
    
    // Create assistant message placeholder
    const assistantContentDiv = appendMessage("assistant", "...");
    
    const provider = document.getElementById("pg-provider").value;
    const model = document.getElementById("pg-model").value;
    const useSemantic = document.getElementById("pg-semantic").checked;
    
    const payload = {
        model: model,
        stream: true,
        useSemanticCompression: useSemantic,
        messages: playgroundMessages
    };
    
    try {
        const response = await fetch("/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            assistantContentDiv.innerText = "Error: " + response.statusText;
            return;
        }
        
        assistantContentDiv.innerText = "";
        let fullResponse = "";
        
        // Setup SSE reading
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            
            // Keep the last incomplete line in buffer
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
                    const dataStr = line.substring(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                            fullResponse += data.choices[0].delta.content;
                            assistantContentDiv.innerText = fullResponse;
                            chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
                        }
                    } catch (e) {
                        // ignore parse errors for partial chunks
                    }
                }
            }
        }
        
        // Add full response to state
        playgroundMessages.push({ role: "assistant", content: fullResponse });
        
        // After stream is done, fetch the latest stat row to update the UI
        setTimeout(async () => {
            try {
                const logsRes = await fetch("/api/logs?limit=1");
                const logs = await logsRes.json();
                if(logs.length > 0) {
                    const latest = logs[0];
                    const saved = latest.original_prompt_tokens - latest.optimized_prompt_tokens;
                    pgSaved.innerText = saved.toLocaleString();
                    pgCost.innerText = `$${latest.cost_usd.toFixed(4)}`;
                }
            } catch(e){}
        }, 500); // slight delay to ensure DB log is saved
        
    } catch (err) {
        assistantContentDiv.innerText = "Connection error.";
    }
}

chatSendBtn.addEventListener("click", sendPlaygroundMessage);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendPlaygroundMessage();
    }
});

pgClearBtn.addEventListener("click", () => {
    playgroundMessages = [];
    chatHistoryEl.innerHTML = `<div class="message system"><div class="message-content">Chat history cleared.</div></div>`;
    pgSaved.innerText = "0";
    pgCost.innerText = "$0.00";
});


