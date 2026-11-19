# Model Context Protocol (MCP) TypeScript Monorepo

A comprehensive, production-ready TypeScript project implementing all three fundamental architectural roles of the **Model Context Protocol (MCP)**:

1. **Server (`@mcp-project/server`)**: Exposes tools, resources, and prompt templates over **HTTP (Server-Sent Events)** or standard I/O (**stdio**), guarded by **Authentication & Authorization (RBAC)**.
2. **Client (`@mcp-project/client`)**: A reusable, type-safe client library that connects to MCP servers over HTTP SSE or Stdio with Bearer Token authentication.
3. **Host (`@mcp-project/host`)**: The root orchestrator and application runtime (analogous to Claude Desktop or Antigravity) that authenticates against MCP servers, aggregates their tools and resources into a unified registry, and runs an intelligent AI Agent loop with an interactive CLI.

---

## Authentication & Authorization (RBAC)

The project includes an end-to-end security layer supporting **Token Authentication** and **Role-Based Access Control (RBAC)**:

### 1. Authentication (AuthN)
- **HTTP SSE**: Authenticates via `Authorization: Bearer <token>` header, `x-api-key` header, or URL query param `?token=<token>`. Unauthenticated requests receive `401 Unauthorized`.
- **Stdio**: Authenticates via environment variable `MCP_AUTH_TOKEN`.

### 2. Authorization & Roles (AuthZ)

| Role | Token | Scopes & Permissions | Allowed Capabilities | Restricted Capabilities |
|------|-------|----------------------|----------------------|-------------------------|
| **`admin`** | `admin-token-secret-123` | `*` (Full access) | All tools (`calculate`, `weather_report`, `get_system_info:detailed`, `manage_notes:create`, `read`, `list`, `delete`), all resources (`system://info`, `notes://all`, `config://server`), all prompts | None |
| **`user`** | `user-token-secret-456` | `tools:*`, `notes:create/read/list`, `resources:system` | Math, weather, basic system info, creating & reading notes | Deleting notes (`notes:delete`), reading server config (`config://server`) |
| **`guest`** | `guest-token-secret-789` | `tools:calculate`, `tools:weather`, `notes:read/list` | Math, weather, reading public notes | Creating notes, deleting notes, viewing system diagnostics or server config |

---

## Dynamic Server Resolution (No Hardcoded Paths)

Neither `client` nor `host` hardcodes server file paths or URLs. Connection parameters are resolved dynamically via:
1. **`.env` file** (`MCP_SERVER_URL` or `MCP_SERVER_PATH`, plus `MCP_AUTH_TOKEN`)
2. **`mcp-config.json`** (`defaultServerUrl` or `defaultServerPath`)

### Setting up `.env`

```env
# ==============================================================================
# Model Context Protocol (MCP) Configuration (.env)
# ==============================================================================

# OPTION 1: HTTP SSE Transport (Remote or Local HTTP server)
MCP_SERVER_URL=http://localhost:3001/sse

# OPTION 2: Local Stdio Transport
# MCP_SERVER_PATH=./packages/server/dist/index.js

# Server Port and Transport Mode
PORT=3001
MCP_TRANSPORT=http

# Authentication Tokens
MCP_AUTH_TOKEN=admin-token-secret-123
MCP_ADMIN_TOKEN=admin-token-secret-123
MCP_USER_TOKEN=user-token-secret-456
MCP_GUEST_TOKEN=guest-token-secret-789
```

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │              MCP HOST                  │
                      │         (AI App / Orchestrator)        │
                      │  - Multi-server manager & aggregator   │
                      │  - Injects Auth Bearer Token           │
                      │  - Agent reasoning & tool planner      │
                      │  - Interactive CLI REPL / Demo runner  │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │              MCP CLIENT                │
                      │  - Bearer token / x-api-key headers    │
                      │  - Automatic SSE or Stdio transport    │
                      │  - listTools / callTool                │
                      │  - listResources / readResource        │
                      │  - listPrompts / getPrompt             │
                      └──────────────────┬─────────────────────┘
                                         │
                         HTTP SSE (with Auth) or Stdio
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │              MCP SERVER                │
                      │  - AuthN: Token verification (401)     │
                      │  - AuthZ: RBAC permission checks (403) │
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
├── .env                                # Active environment & token configuration
├── .env.example                        # Template for environment settings
├── mcp-config.json                     # Fallback server path & URL configuration
├── packages/
│   ├── server/                         # MCP Server
│   │   ├── src/
│   │   │   ├── index.ts               # Server entrypoint (HTTP SSE + Stdio + Auth)
│   │   │   ├── auth.ts                # Token verification & RBAC authorization
│   │   │   ├── tools.ts               # Tools with permission enforcement
│   │   │   ├── resources.ts           # Resources with access control
│   │   │   ├── prompts.ts             # Prompts with authorization
│   │   │   └── types.ts               # Server data types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── client/                         # MCP Client Library & Test Suite
│   │   ├── src/
│   │   │   ├── index.ts               # Client RBAC verification test suite
│   │   │   ├── client.ts              # McpClient with HTTP SSE & Stdio Auth
│   │   │   ├── config.ts              # Dynamic .env & config file resolver
│   │   │   └── types.ts               # Client config & payload types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── host/                           # MCP Host Runtime & Agent Loop
│       ├── src/
│       │   ├── index.ts               # Host entrypoint (Interactive CLI & demo)
│       │   ├── host.ts                # McpHost registry & token injection
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

### 2. Testing Authentication & Authorization

#### Step 1: Start the MCP Server in HTTP mode
```bash
npm run start:server:http
```

#### Step 2: Run the Security & RBAC Test Suite
```bash
npm run start:client
```
*The client demo automatically executes three test suites:*
1. **Admin Test**: Connects with `admin-token-secret-123`, creates a note, reads `config://server`, and deletes a note.
2. **Guest Test**: Connects with `guest-token-secret-789`, confirms math calculations are allowed, but verifies that creating notes or reading `config://server` is blocked with `403 Forbidden`.
3. **Invalid Token Test**: Attempts to connect with an invalid token and confirms the connection is rejected with `401 Unauthorized`.

---

### 3. Running the MCP Host

#### Automated End-to-End Demo:
```bash
npm run demo:host
```

#### Interactive CLI (with Auth):
```bash
npm run start:host
```
*Inside the CLI, type `/whoami` to inspect your active token and role permissions, or test slash commands like `/tools`, `/resources`, `/prompts`, and `/read system://info`.*

---

## License

ISC
