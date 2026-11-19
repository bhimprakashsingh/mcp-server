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

import {
  authenticateToken,
  extractTokenFromRequest,
  type AuthUser,
} from './auth.js';
import { handleGetPrompt, promptDefinitions } from './prompts.js';
import { handleReadResource, resourceDefinitions } from './resources.js';
import { handleCallTool, toolDefinitions } from './tools.js';

// Auto-load .env
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../../.env') });
dotenv.config();

export function createServer(authUser?: AuthUser): Server {
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

  // 1. Tool handlers with authorization
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleCallTool(request.params.name, request.params.arguments, authUser);
  });

  // 2. Resource handlers with authorization
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resourceDefinitions };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return handleReadResource(request.params.uri, authUser);
  });

  // 3. Prompt handlers with authorization
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: promptDefinitions };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return handleGetPrompt(request.params.name, request.params.arguments, authUser);
  });

  return server;
}

/**
 * Start Server using HTTP SSE Transport with Authentication & Authorization.
 */
export async function startHttpServer(port: number = 3001): Promise<http.Server> {
  const sessions = new Map<
    string,
    { server: Server; transport: SSEServerTransport; user: AuthUser }
  >();

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') {
      res.writeHead(200).end();
      return;
    }

    const host = req.headers.host ?? `localhost:${port}`;
    const url = new URL(req.url ?? '/', `http://${host}`);

    // Health check endpoint (Public)
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

    // SSE Connection endpoint (Authentication required)
    if (url.pathname === '/sse' && req.method === 'GET') {
      const token = extractTokenFromRequest(req);
      const authResult = authenticateToken(token);

      if (!authResult.authenticated || !authResult.user) {
        console.warn(`[mcp-server:auth] 401 Unauthorized SSE connection attempt from ${req.socket.remoteAddress}. Error: ${authResult.error}`);
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="mcp-server"',
        }).end(
          JSON.stringify({
            error: 'Unauthorized',
            message: authResult.error || 'Valid authentication token required.',
          })
        );
        return;
      }

      console.log(
        `[mcp-server:auth] ✓ Authenticated SSE client: ${authResult.user.username} (Role: ${authResult.user.role})`
      );

      const serverInstance = createServer(authResult.user);
      const transport = new SSEServerTransport('/message', res);
      const sessionId = transport.sessionId;

      sessions.set(sessionId, {
        server: serverInstance,
        transport,
        user: authResult.user,
      });

      transport.onclose = () => {
        console.log(`[mcp-server:http] Session ${sessionId} (${authResult.user?.username}) closed`);
        sessions.delete(sessionId);
      };

      await serverInstance.connect(transport);
      return;
    }

    // POST Message endpoint
    if (url.pathname === '/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      const session = sessionId
        ? sessions.get(sessionId)
        : sessions.values().next().value;

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ error: `Session not found or expired. Active sessions: ${sessions.size}` })
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
      console.log(`[mcp-server] Server running in HTTP SSE mode with Authentication`);
      console.log(`[mcp-server] SSE Endpoint:  http://localhost:${port}/sse`);
      console.log(`[mcp-server] Health Check: http://localhost:${port}/health`);
      console.log(`[mcp-server] Auth: Bearer Token / x-api-key / ?token=...`);
      console.log('='.repeat(65));
      resolve(httpServer);
    });
  });
}

/**
 * Start Server using standard I/O (Stdio) Transport with Auth Context.
 */
export async function startStdioServer(): Promise<void> {
  const token = process.env.MCP_AUTH_TOKEN || process.env.MCP_ADMIN_TOKEN || 'admin-token-secret-123';
  const auth = authenticateToken(token);
  const authUser = auth.authenticated ? auth.user : undefined;

  const server = createServer(authUser);
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
    `[mcp-server] Server started on stdio transport (User: ${authUser?.username ?? 'Anonymous'}, Role: ${authUser?.role ?? 'none'})`
  );
}

/**
 * Main launcher checking .env and CLI arguments.
 */
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
