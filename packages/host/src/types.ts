import type { PromptInfo, ResourceInfo, ToolDefinitionInfo } from '@mcp-project/client';

export interface HostServerConfig {
  id: string;
  name: string;
  url?: string;
  path?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface UnifiedTool extends ToolDefinitionInfo {
  serverId: string;
}

export interface UnifiedResource extends ResourceInfo {
  serverId: string;
}

export interface UnifiedPrompt extends PromptInfo {
  serverId: string;
}

export interface AgentStep {
  step: number;
  thought: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: unknown;
}

export interface AgentResponse {
  query: string;
  steps: AgentStep[];
  answer: string;
}
