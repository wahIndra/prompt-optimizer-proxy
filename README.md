
# AI Prompt Optimizer Proxy

A high-performance middleware proxy for Large Language Models that sits transparently between your IDE (Cursor, Cline, VS Code) and your AI Providers (OpenAI, Anthropic, Gemini, Ollama). 

It dynamically intercepts your prompts and dramatically reduces your token usage via **Deep Semantic Compression**, **Prompt Minification**, and **Automated Ephemeral Caching**.

## Features

- **Transparent IDE Integration**: Works flawlessly as a drop-in replacement for OpenAI/Anthropic APIs.
- **Deep Semantic Compression**: Automatically offloads context payloads > 8k tokens to a local Ollama instance (like `llama3.2`) to summarize and compress dense history into crucial facts, preserving token space.
- **Automated Prompt Caching**: Dynamically injects `ephemeral` cache control headers for Anthropic models, ensuring up to 90% cost reduction on massive system prompts and file context.
- **Real-Time SSE Streaming**: Native Server-Sent Events support for buttery-smooth streaming in your IDE.
- **Premium Dashboard**: A built-in Single Page Application (SPA) dashboard to view real-time token savings, manage configurations, and test prompts in an interactive Playground.
- **Dynamic Model Discovery**: Instantly fetches and aggregates available models from all your configured providers (including local Ollama models).
- **Custom Gateways**: Route your proxy traffic through Azure enterprise endpoints, LiteLLM, or corporate gateways.

## Companion Libraries (gstack & ralph-playbook)

To get the full autonomous AI experience (including the custom `prompt-diet` skill), this proxy is designed to work in tandem with two companion agent frameworks. We highly recommend forking and cloning them alongside this proxy:

1. **[gstack](https://github.com/wahIndra/gstack.git)**: The core AI agent operating system.
2. **[ralph-playbook](https://github.com/wahIndra/ralph-playbook.git)**: The agent playbook libraries.

When using `gstack`, the agent will natively leverage this proxy to intelligently compress massive context payloads using the custom `prompt-diet` skill!

## Installation

```bash
# 1. Clone the Proxy
git clone https://github.com/wahIndra/prompt-optimizer-proxy.git
cd prompt-optimizer-proxy

# 2. Install dependencies
npm install

# 3. Link the CLI globally (Optional but recommended)
npm link
```

## Usage

You can run the proxy directly:
```bash
npm start
```

Or, if you linked the package globally, use the powerful CLI daemon:
```bash
prompt-optimizer run     # Runs in foreground
prompt-optimizer start   # Runs in background (daemon)
prompt-optimizer stop    # Stops the daemon
prompt-optimizer status  # Checks daemon status
```

### Dashboard
Once running, the Premium Dashboard is available at:
**http://localhost:3000**

You can configure your API keys securely through the dashboard UI, or via the CLI:
```bash
prompt-optimizer config set OPENAI_API_KEY sk-...
prompt-optimizer config set ANTHROPIC_API_KEY sk-ant-...
```

## Connecting your IDE (Cursor / Cline)

To route your IDE's AI requests through the proxy to save tokens:

1. Open your IDE's AI Settings.
2. Change the **API Base URL** (or Custom OpenAI URL) to: `http://localhost:3000/v1`
3. Leave your API Key as-is (the proxy handles routing natively).
4. The IDE will dynamically fetch the models from the proxy and they will appear in your dropdowns!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

