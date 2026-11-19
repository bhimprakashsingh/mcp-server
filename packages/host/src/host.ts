import { McpClient, resolveServerTarget } from '@mcp-project/client';
import type {
  HostServerConfig,
  UnifiedPrompt,
  UnifiedResource,
  UnifiedTool,
} from './types.js';

export class McpHost {
  private servers = new Map<string, HostServerConfig>();
  private clients = new Map<string, McpClient>();
  private toolRegistry = new Map<string, UnifiedTool>();
  private resourceRegistry = new Map<string, UnifiedResource>();
  private promptRegistry = new Map<string, UnifiedPrompt>();
  private isRunning = false;

  constructor(defaultAuthToken?: string) {
    // Resolve server target from .env or mcp-config.json file (no hardcoded path!)
    const target = resolveServerTarget();
    const token = 'guest-token-secret-789';
    defaultAuthToken ??
      process.env.MCP_AUTH_TOKEN ??
      process.env.MCP_ADMIN_TOKEN ??
      'admin-token-secret-123';

    if (target.transportType === 'http') {
      this.registerServer({
        id: 'core-server',
        name: 'MCP Core Server (HTTP)',
        url: target.url,
        authToken: token,
      });
    } else {
      this.registerServer({
        id: 'core-server',
        name: 'MCP Core Server (Stdio)',
        path: target.path,
        command: target.command,
        args: target.args,
        authToken: token,
      });
    }
  }

  /**
   * Register a new MCP server configuration.
   */
  registerServer(config: HostServerConfig): void {
    if (this.isRunning) {
      throw new Error('Cannot register servers while host is running');
    }
    this.servers.set(config.id, config);
  }

  /**
   * Start the Host: connect to all registered servers and aggregate registries.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    for (const [id, config] of this.servers.entries()) {
      const client = new McpClient({
        name: `mcp-host-client-for-${id}`,
        serverUrl: config.url,
        serverPath: config.path,
        serverCommand: config.command,
        serverArgs: config.args,
        authToken: config.authToken,
        serverCwd: config.cwd,
        serverEnv: config.env,
      });

      await client.connect();
      this.clients.set(id, client);

      // 1. Index Tools
      const tools = await client.listTools();
      for (const tool of tools) {
        this.toolRegistry.set(tool.name, { ...tool, serverId: id });
      }

      // 2. Index Resources
      const resources = await client.listResources();
      for (const res of resources) {
        this.resourceRegistry.set(res.uri, { ...res, serverId: id });
      }

      // 3. Index Prompts
      const prompts = await client.listPrompts();
      for (const prompt of prompts) {
        this.promptRegistry.set(prompt.name, { ...prompt, serverId: id });
      }
    }

    this.isRunning = true;
  }

  /**
   * Get all aggregated tools across all connected servers.
   */
  getTools(): UnifiedTool[] {
    return Array.from(this.toolRegistry.values());
  }

  /**
   * Get all aggregated resources.
   */
  getResources(): UnifiedResource[] {
    return Array.from(this.resourceRegistry.values());
  }

  /**
   * Get all aggregated prompts.
   */
  getPrompts(): UnifiedPrompt[] {
    return Array.from(this.promptRegistry.values());
  }

  /**
   * Execute a tool call, routing it automatically to the server that provides it.
   */
  async callTool(name: string, args: Record<string, unknown> = {}) {
    const tool = this.toolRegistry.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found on any connected MCP server`);
    }

    const client = this.clients.get(tool.serverId);
    if (!client) {
      throw new Error(`No active client found for server '${tool.serverId}'`);
    }

    return await client.callTool(name, args);
  }

  /**
   * Read a resource URI from the server that exposes it.
   */
  async readResource(uri: string) {
    const resource = this.resourceRegistry.get(uri);
    if (!resource) {
      throw new Error(`Resource '${uri}' not found on any connected MCP server`);
    }

    const client = this.clients.get(resource.serverId);
    if (!client) {
      throw new Error(`No active client found for server '${resource.serverId}'`);
    }

    return await client.readResource(uri);
  }

  /**
   * Retrieve a prompt template.
   */
  async getPrompt(name: string, args?: Record<string, string>) {
    const prompt = this.promptRegistry.get(name);
    if (!prompt) {
      throw new Error(`Prompt '${name}' not found on any connected MCP server`);
    }

    const client = this.clients.get(prompt.serverId);
    if (!client) {
      throw new Error(`No active client found for server '${prompt.serverId}'`);
    }

    return await client.getPrompt(name, args);
  }

  /**
   * Gracefully shut down all client connections.
   */
  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
    this.toolRegistry.clear();
    this.resourceRegistry.clear();
    this.promptRegistry.clear();
    this.isRunning = false;
  }
}
