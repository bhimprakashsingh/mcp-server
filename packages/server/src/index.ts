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

import { promptDefinitions, handleGetPrompt } from './prompts.js';
import { resourceDefinitions, handleReadResource } from './resources.js';
import { toolDefinitions, handleCallTool } from './tools.js';

// Auto-load .env
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../../.env') });
dotenv.config(); // also check process.cwd()

export function createServer(): Server {
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

  // 1. Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleCallTool(request.params.name, request.params.arguments);
  });

  // 2. Resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resourceDefinitions };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return handleReadResource(request.params.uri);
  });

  // 3. Prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: promptDefinitions };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return handleGetPrompt(request.params.name, request.params.arguments);
  });

  return server;
}

/**
 * Start Server using HTTP SSE Transport.
 */
export async function startHttpServer(port: number = 3001): Promise<http.Server> {
  const sessions = new Map<string, { server: Server; transport: SSEServerTransport }>();

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200).end();
      return;
    }

    const host = req.headers.host ?? `localhost:${port}`;
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (url.pathname === '/sse' && req.method === 'GET') {
      console.log(`[mcp-server:http] New client SSE connection request from ${req.socket.remoteAddress}`);
      const serverInstance = createServer();
      const transport = new SSEServerTransport('/message', res);
      const sessionId = transport.sessionId;

      sessions.set(sessionId, { server: serverInstance, transport });

      transport.onclose = () => {
        console.log(`[mcp-server:http] Session ${sessionId} closed`);
        sessions.delete(sessionId);
      };

      await serverInstance.connect(transport);
      console.log(`[mcp-server:http] Session ${sessionId} established and listening`);
      return;
    }

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

    if (url.pathname === '/' || url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          status: 'ok',
          server: 'mcp-demo-server',
          transport: 'http-sse',
          port,
          endpoints: {
            sse: `http://localhost:${port}/sse`,
            message: `http://localhost:${port}/message`,
          },
          activeSessions: sessions.size,
        })
      );
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log('='.repeat(65));
      console.log(`[mcp-server] Server running in HTTP SSE mode`);
      console.log(`[mcp-server] SSE Endpoint:  http://localhost:${port}/sse`);
      console.log(`[mcp-server] Health Check: http://localhost:${port}/health`);
      console.log('='.repeat(65));
      resolve(httpServer);
    });
  });
}

/**
 * Start Server using standard I/O (Stdio) Transport.
 */
export async function startStdioServer(): Promise<void> {
  const server = createServer();
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
  console.error('[mcp-server] Server started on stdio transport');
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
