import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface McpClientConfig {
  name?: string;
  version?: string;
  transport?: Transport;
  /** Server URL for HTTP SSE transport (e.g. 'http://localhost:3001/sse') */
  serverUrl?: string;
  /** Server file or script path for Stdio transport */
  serverPath?: string;
  /** Command to spawn server (e.g. 'node' or 'npx') */
  serverCommand?: string;
  /** Arguments to pass to serverCommand */
  serverArgs?: string[];
  /** Authentication token (Bearer token or API Key) */
  authToken?: string;
  /** Working directory for server process */
  serverCwd?: string;
  /** Environment variables for server process */
  serverEnv?: Record<string, string>;
}

export interface ToolDefinitionInfo {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ResourceInfo {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface PromptInfo {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface CallToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
