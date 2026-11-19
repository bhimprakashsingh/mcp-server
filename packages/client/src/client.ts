import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { resolveServerTarget } from './config.js';
import type {
  CallToolResult,
  McpClientConfig,
  PromptInfo,
  ResourceInfo,
  ToolDefinitionInfo,
} from './types.js';

export class McpClient {
  private client: Client;
  private transport: Transport | null = null;
  private isConnected = false;
  private config: McpClientConfig;

  constructor(config: McpClientConfig = {}) {
    this.config = config;
    this.client = new Client(
      {
        name: config.name ?? 'mcp-demo-client',
        version: config.version ?? '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  /**
   * Connect to the MCP Server over HTTP SSE or Stdio transport
   * depending on .env or config file settings.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.config.transport) {
      this.transport = this.config.transport;
      await this.client.connect(this.transport);
      this.isConnected = true;
      return;
    }

    // Resolve server target from .env or config file (no hardcoding in code!)
    const target = resolveServerTarget({
      serverUrl: this.config.serverUrl,
      serverPath: this.config.serverPath,
    });

    // Resolve authentication token from config, .env, or default admin key
    const authToken =
      this.config.authToken ??
      process.env.MCP_AUTH_TOKEN ??
      process.env.MCP_ADMIN_TOKEN ??
      'admin-token-secret-123';

    if (target.transportType === 'http') {
      console.log(`[mcp-client] Connecting to MCP Server over HTTP SSE: ${target.url} (Auth: ${authToken ? 'Token provided' : 'None'})`);
      const sseUrl = new URL(target.url);
      if (authToken) {
        sseUrl.searchParams.set('token', authToken);
      }

      const sseTransport = new SSEClientTransport(sseUrl, {
        eventSourceInit: (authToken
          ? { headers: { Authorization: `Bearer ${authToken}` } }
          : undefined) as any,
        requestInit: {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      });
      this.transport = sseTransport;
      await this.client.connect(sseTransport);
      this.isConnected = true;
      return;
    }

    // Stdio transport: resolve command and args based on target file path
    const resolvedPath = path.isAbsolute(target.path)
      ? target.path
      : path.resolve(process.cwd(), target.path);

    const isTypeScript = resolvedPath.endsWith('.ts');
    const defaultCommand = isTypeScript
      ? process.platform === 'win32'
        ? 'npx.cmd'
        : 'npx'
      : process.execPath; // node

    const command = this.config.serverCommand ?? defaultCommand;
    const defaultArgs = isTypeScript ? ['tsx', resolvedPath] : [resolvedPath];
    const args = this.config.serverArgs ?? defaultArgs;

    console.log(`[mcp-client] Spawning MCP Server over Stdio: ${command} ${args.join(' ')}`);

    // Safely collect environment variables
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    if (authToken) {
      env.MCP_AUTH_TOKEN = authToken;
    }
    if (this.config.serverEnv) {
      Object.assign(env, this.config.serverEnv);
    }

    const stdioTransport = new StdioClientTransport({
      command,
      args,
      cwd: this.config.serverCwd ?? process.cwd(),
      env,
      stderr: 'inherit',
    });

    this.transport = stdioTransport;
    await this.client.connect(stdioTransport);
    this.isConnected = true;
  }

  /**
   * Ping the server to check connectivity.
   */
  async ping(): Promise<void> {
    this.ensureConnected();
    await this.client.ping();
  }

  /**
   * List all tools offered by the server.
   */
  async listTools(): Promise<ToolDefinitionInfo[]> {
    this.ensureConnected();
    const result = await this.client.listTools();
    return result.tools as ToolDefinitionInfo[];
  }

  /**
   * Call a tool on the server with specified arguments.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    this.ensureConnected();
    const response = await this.client.callTool({
      name,
      arguments: args,
    });
    return response as CallToolResult;
  }

  /**
   * List all resources offered by the server.
   */
  async listResources(): Promise<ResourceInfo[]> {
    this.ensureConnected();
    const result = await this.client.listResources();
    return result.resources as ResourceInfo[];
  }

  /**
   * Read contents of a resource by URI.
   */
  async readResource(uri: string): Promise<Array<{ uri: string; mimeType?: string; text?: string }>> {
    this.ensureConnected();
    const result = await this.client.readResource({ uri });
    return result.contents as Array<{ uri: string; mimeType?: string; text?: string }>;
  }

  /**
   * List all prompt templates offered by the server.
   */
  async listPrompts(): Promise<PromptInfo[]> {
    this.ensureConnected();
    const result = await this.client.listPrompts();
    return result.prompts as PromptInfo[];
  }

  /**
   * Retrieve a prompt with rendered arguments.
   */
  async getPrompt(name: string, args?: Record<string, string>) {
    this.ensureConnected();
    return await this.client.getPrompt({
      name,
      arguments: args,
    });
  }

  /**
   * Get server capabilities reported during handshake.
   */
  getServerCapabilities() {
    this.ensureConnected();
    return this.client.getServerCapabilities();
  }

  /**
   * Get server version info.
   */
  getServerVersion() {
    this.ensureConnected();
    return this.client.getServerVersion();
  }

  /**
   * Disconnect and close transport.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.close();
      if (this.transport) {
        await this.transport.close();
      }
    } finally {
      this.isConnected = false;
      this.transport = null;
    }
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('McpClient is not connected. Call .connect() first.');
    }
  }
}
