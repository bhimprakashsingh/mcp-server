#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { AuthUser } from './auth.js';
import {
  AuthMiddleware,
  AuthorizationError,
  createStdioAuthMiddleware,
  httpAuthMiddleware,
} from './middleware.js';
import { handleGetPrompt, promptDefinitions } from './prompts.js';
import { handleReadResource, resourceDefinitions } from './resources.js';
import { handleCallTool, toolDefinitions } from './tools.js';

// Auto-load .env
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../../.env') });
dotenv.config();

/**
 * Create and wire an MCP Server instance with centralized auth middleware.
 *
 * The middleware enforces authorization *before* any handler runs,
 * so tools/resources/prompts stay pure business logic.
 */
export function createServer(authMw: AuthMiddleware): Server {
  const server = new Server(
    {
      name: 'mcp-demo-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  const authUser = authMw.getUser();

  // ── Tool handlers ───────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Middleware: enforce authorization before the handler runs
    const check = authMw.check('tool', name, (args as Record<string, unknown>) ?? {});
    if (!check.allowed) {
      return {
        content: [{ type: 'text' as const, text: check.reason! }],
        isError: true,
      };
    }

    return handleCallTool(name, args, authUser?.username);
  });

  // ── Resource handlers ───────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resourceDefinitions };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Middleware: enforce authorization
    authMw.enforce('resource', uri);

    return handleReadResource(uri, authUser);
  });

  // ── Prompt handlers ─────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: promptDefinitions };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Middleware: enforce authorization
    authMw.enforce('prompt', name);

    return handleGetPrompt(name, args, authUser);
  });

  return server;
}

// ═══════════════════════════════════════════════════════════════
//  HTTP Server with Authentication Middleware
// ═══════════════════════════════════════════════════════════════

export async function startHttpServer(port: number = 3001): Promise<http.Server> {
  const sessions = new Map<
    string,
    { server: Server; transport: SSEServerTransport; user: AuthUser }
  >();

  const httpServer = http.createServer(async (req, res) => {
    // ── CORS middleware ──
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') {
      res.writeHead(200).end();
      return;
    }

    const host = req.headers.host ?? `localhost:${port}`;
    const url = new URL(req.url ?? '/', `http://${host}`);

    // ── Health endpoint (public, no auth) ──
    if (url.pathname === '/' || url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          status: 'ok',
          server: 'mcp-demo-server',
          transport: 'http-sse',
          port,
          authEnabled: true,
          endpoints: {
            sse: `http://localhost:${port}/sse`,
            message: `http://localhost:${port}/message`,
          },
          activeSessions: sessions.size,
        })
      );
      return;
    }

    // ── SSE endpoint (auth middleware gate) ──
    if (url.pathname === '/sse' && req.method === 'GET') {
      // Run the HTTP auth middleware — returns false if 401 was sent
      const authedReq = req as typeof req & {
        authMiddleware?: AuthMiddleware;
      };
      if (!httpAuthMiddleware(authedReq, res)) {
        return; // 401 already sent
      }

      const authMw = authedReq.authMiddleware!;
      const user = authMw.getUser()!;

      const serverInstance = createServer(authMw);
      const transport = new SSEServerTransport('/message', res);
      const sessionId = transport.sessionId;

      sessions.set(sessionId, { server: serverInstance, transport, user });

      transport.onclose = () => {
        console.log(`[mcp-server:http] Session ${sessionId} (${user.username}) closed`);
        sessions.delete(sessionId);
      };

      await serverInstance.connect(transport);
      return;
    }

    // ── Message endpoint (session-scoped, auth already established) ──
    if (url.pathname === '/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      const session = sessionId
        ? sessions.get(sessionId)
        : sessions.values().next().value;

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            error: `Session not found or expired. Active sessions: ${sessions.size}`,
          })
        );
        return;
      }

      await session.transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log('='.repeat(65));
      console.log(`[mcp-server] Server running in HTTP SSE mode`);
      console.log(`[mcp-server] Auth middleware: enabled (Bearer / x-api-key / ?token=)`);
      console.log(`[mcp-server] SSE Endpoint:  http://localhost:${port}/sse`);
      console.log(`[mcp-server] Health Check:  http://localhost:${port}/health`);
      console.log('='.repeat(65));
      resolve(httpServer);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  Stdio Server with Auth Middleware (env-based token)
// ═══════════════════════════════════════════════════════════════

export async function startStdioServer(): Promise<void> {
  const authMw = createStdioAuthMiddleware();
  const authUser = authMw.getUser();

  const server = createServer(authMw);
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    console.error('[mcp-server] Received SIGINT, shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[mcp-server] Received SIGTERM, shutting down...');
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  console.error(
    `[mcp-server] Server started on stdio (User: ${authUser?.username ?? 'Anonymous'}, Role: ${authUser?.role ?? 'none'})`
  );
}

// ═══════════════════════════════════════════════════════════════
//  Entrypoint
// ═══════════════════════════════════════════════════════════════

export async function main() {
  const useHttp =
    process.argv.includes('--http') ||
    process.env.MCP_TRANSPORT === 'http' ||
    process.env.MCP_SERVER_URL !== undefined;

  const port = parseInt(process.env.PORT ?? '3001', 10);

  if (useHttp && !process.argv.includes('--stdio')) {
    await startHttpServer(port);
  } else {
    await startStdioServer();
  }
}

// Auto-run only if executed directly
const isDirectExecution =
  process.argv[1] &&
  (path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) ||
    process.argv[1].endsWith('mcp-server'));

if (isDirectExecution) {
  main().catch((error) => {
    console.error('[mcp-server] Fatal error starting server:', error);
    process.exit(1);
  });
}
