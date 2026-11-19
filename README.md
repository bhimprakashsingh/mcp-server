# Model Context Protocol (MCP) TypeScript Monorepo

A comprehensive, production-ready TypeScript project implementing all three fundamental architectural roles of the **Model Context Protocol (MCP)**:

1. **Server (`@mcp-project/server`)**: Exposes tools, resources, and prompt templates over **HTTP (Server-Sent Events)** or standard I/O (**stdio**).
2. **Client (`@mcp-project/client`)**: A reusable, type-safe client library that connects to MCP servers over HTTP SSE or Stdio, dynamically driven by `.env` or config files.
3. **Host (`@mcp-project/host`)**: The root orchestrator and application runtime (analogous to Claude Desktop or Antigravity) that connects to one or more MCP servers (over HTTP or Stdio), aggregates their tools and resources into a unified registry, and runs an intelligent AI Agent loop with an interactive CLI.

---

## Dynamic Server Resolution (No Hardcoded Paths)

Neither `client` nor `host` hardcodes server file paths or URLs. Connection parameters are resolved dynamically via:
1. **`.env` file** (`MCP_SERVER_URL` or `MCP_SERVER_PATH`)
2. **`mcp-config.json`** (`defaultServerUrl` or `defaultServerPath`)

### Setting up `.env`

```env
# ==============================================================================
# Model Context Protocol (MCP) Configuration (.env)
# ==============================================================================

# OPTION 1: HTTP SSE Transport (Remote or Local HTTP server)
MCP_SERVER_URL=http://localhost:3001/sse

# OPTION 2: Local Stdio Transport
# Uncomment below and comment out MCP_SERVER_URL to spawn over stdio
# MCP_SERVER_PATH=./packages/server/dist/index.js

# Server Port and Transport Mode for packages/server
PORT=3001
MCP_TRANSPORT=http
```

### Fallback Config File (`mcp-config.json`)

```json
{
  "defaultServerPath": "./packages/server/dist/index.js",
  "defaultServerUrl": "http://localhost:3001/sse",
  "server": {
    "port": 3001,
    "transport": "http"
  }
}
```

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │              MCP HOST                  │
                      │         (AI App / Orchestrator)        │
                      │  - Multi-server manager & aggregator   │
                      │  - Reads server target from .env       │
                      │  - Agent reasoning & tool planner      │
                      │  - Interactive CLI REPL / Demo runner  │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │              MCP CLIENT                │
                      │  - Reads server target from .env       │
                      │  - Automatically uses SSE or Stdio     │
                      │  - listTools / callTool                │
                      │  - listResources / readResource        │
                      │  - listPrompts / getPrompt             │
                      └──────────────────┬─────────────────────┘
                                         │
                         HTTP SSE or JSON-RPC over stdio
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │              MCP SERVER                │
                      │  - Transports: HTTP (SSE) or Stdio     │
                      │  - Tools: calculate, get_system_info,  │
                      │           manage_notes, weather_report │
                      │  - Resources: system://info,           │
                      │               notes://all,             │
                      │               config://server          │
                      │  - Prompts: system_diagnostics,        │
                      │             summarize_notes            │
                      └────────────────────────────────────────┘
```

---

## Project Structure

```
.
├── .env                                # Active environment configuration
├── .env.example                        # Template for environment settings
├── mcp-config.json                     # Fallback server path & URL configuration
├── packages/
│   ├── server/                         # MCP Server
│   │   ├── src/
│   │   │   ├── index.ts               # Server entrypoint (HTTP SSE + Stdio modes)
│   │   │   ├── tools.ts               # Tool definitions & execution logic
│   │   │   ├── resources.ts           # Resource URIs & dynamic generators
│   │   │   ├── prompts.ts             # Prompt templates
│   │   │   └── types.ts               # Server TypeScript data types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── client/                         # MCP Client Library & Test Suite
│   │   ├── src/
│   │   │   ├── index.ts               # Client exports & standalone test suite
│   │   │   ├── client.ts              # McpClient class supporting HTTP SSE & Stdio
│   │   │   ├── config.ts              # Dynamic .env & config file resolver
│   │   │   └── types.ts               # Client config & payload types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── host/                           # MCP Host Runtime & Agent Loop
│       ├── src/
│       │   ├── index.ts               # Host entrypoint (Interactive CLI & demo)
│       │   ├── host.ts                # McpHost registry & multi-server routing
│       │   ├── agent.ts               # HostAgent reasoning & tool dispatch loop
│       │   └── types.ts               # Host interfaces & telemetry types
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                        # Monorepo root (npm workspaces)
├── tsconfig.base.json                  # Shared TypeScript compiler options
├── tsconfig.json                       # Project references root
└── README.md                           # Documentation
```

---

## Getting Started

### 1. Install & Build

```bash
npm install
npm run build
```

---

### 2. Running via HTTP (SSE) Transport

#### Step 1: Start the MCP Server in HTTP mode
```bash
npm run start:server:http
```
*The server will start listening on `http://localhost:3001/sse`.*

#### Step 2: Run the Client or Host
In another terminal:
```bash
# Run the Client Test Suite
npm run start:client

# Run the Host Automated Demo
npm run demo:host

# Run the Host Interactive CLI REPL
npm run start:host
```

---

### 3. Running via Stdio Transport

To switch from HTTP to Stdio transport, edit `.env`:
```env
# Comment out MCP_SERVER_URL and specify MCP_SERVER_PATH:
# MCP_SERVER_URL=http://localhost:3001/sse
MCP_SERVER_PATH=./packages/server/dist/index.js
```

Now run the client or host directly without starting an HTTP server:
```bash
npm run start:client
npm run demo:host
```
*The client/host will automatically spawn the server process via Stdio using the path configured in `.env`.*

---

## Server Capabilities Reference

### Tools

| Tool Name | Description | Arguments |
|-----------|-------------|-----------|
| `calculate` | Performs math operations (`add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`) | `operation` (string), `a` (number), `b` (number, optional) |
| `get_system_info` | Retrieves host OS, CPU count, memory usage, and uptime | `detailed` (boolean, optional) |
| `manage_notes` | Creates, reads, lists, or deletes notes from storage | `action` (`create` \| `read` \| `list` \| `delete`), `id`, `title`, `content` |
| `weather_report` | Simulates weather forecasts for any city | `city` (string), `unit` (`celsius` \| `fahrenheit`) |

### Resources

| URI | MIME Type | Description |
|-----|-----------|-------------|
| `system://info` | `application/json` | Real-time CPU, memory, OS, and process performance snapshot |
| `notes://all` | `application/json` | All current notes formatted in JSON |
| `config://server` | `application/json` | Server identification, protocol version, and capability flags |

### Prompts

| Prompt Name | Description | Arguments |
|-------------|-------------|-----------|
| `system_diagnostics` | Prompts an LLM to evaluate system memory and hardware health | `focus` (e.g. `memory`, `cpu`, `general`) |
| `summarize_notes` | Formats all stored notes and requests an action-item executive summary | `tone` (e.g. `executive`, `technical`, `concise`) |

---

## License

ISC
