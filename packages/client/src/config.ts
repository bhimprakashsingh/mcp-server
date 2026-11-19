import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

let envLoaded = false;

/**
 * Automatically locate and load the root .env file.
 */
export function loadEnvironment(): void {
  if (envLoaded) return;

  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(currentFileDir, '../../../.env'),
    path.resolve(currentFileDir, '../../.env'),
    path.resolve(currentFileDir, '../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      envLoaded = true;
      break;
    }
  }

  // Fallback to process.loadEnvFile if available
  if (!envLoaded && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
      envLoaded = true;
    } catch {
      // Ignore if no default .env exists in current working directory
    }
  }
}

export interface ServerConfigFile {
  defaultServerPath?: string;
  defaultServerUrl?: string;
  server?: {
    port?: number;
    transport?: 'http' | 'stdio';
  };
}

/**
 * Load server defaults from mcp-config.json file.
 */
export function loadServerConfigFile(): ServerConfigFile {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateConfigPaths = [
    path.resolve(process.cwd(), 'mcp-config.json'),
    path.resolve(currentFileDir, '../../../mcp-config.json'),
    path.resolve(currentFileDir, '../../mcp-config.json'),
    path.resolve(currentFileDir, '../mcp-config.json'),
  ];

  for (const configPath of candidateConfigPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.error(`[config] Failed to parse ${configPath}:`, err);
      }
    }
  }

  return {};
}

export type ServerTarget =
  | { transportType: 'http'; url: string }
  | { transportType: 'stdio'; path: string; command?: string; args?: string[] };

/**
 * Resolve the target server endpoint without hardcoding.
 * Priority:
 * 1. User-supplied overrides in config
 * 2. .env file variables (MCP_SERVER_URL, MCP_SERVER_PATH)
 * 3. mcp-config.json file (defaultServerUrl, defaultServerPath)
 */
export function resolveServerTarget(override?: {
  serverUrl?: string;
  serverPath?: string;
}): ServerTarget {
  loadEnvironment();
  const fileConfig = loadServerConfigFile();

  // 1. Check explicit overrides
  if (override?.serverUrl) {
    return { transportType: 'http', url: override.serverUrl };
  }
  if (override?.serverPath) {
    if (override.serverPath.startsWith('http://') || override.serverPath.startsWith('https://')) {
      return { transportType: 'http', url: override.serverPath };
    }
    return { transportType: 'stdio', path: override.serverPath };
  }

  // 2. Check .env variables
  const envUrl = process.env.MCP_SERVER_URL?.trim();
  const envPath = process.env.MCP_SERVER_PATH?.trim();

  if (envUrl) {
    return { transportType: 'http', url: envUrl };
  }

  if (envPath) {
    if (envPath.startsWith('http://') || envPath.startsWith('https://')) {
      return { transportType: 'http', url: envPath };
    }
    return { transportType: 'stdio', path: envPath };
  }

  // 3. Check mcp-config.json file
  if (fileConfig.defaultServerUrl) {
    return { transportType: 'http', url: fileConfig.defaultServerUrl };
  }

  if (fileConfig.defaultServerPath) {
    if (
      fileConfig.defaultServerPath.startsWith('http://') ||
      fileConfig.defaultServerPath.startsWith('https://')
    ) {
      return { transportType: 'http', url: fileConfig.defaultServerPath };
    }
    return { transportType: 'stdio', path: fileConfig.defaultServerPath };
  }

  // Default fallback if no file or env found
  return { transportType: 'http', url: 'http://localhost:3001/sse' };
}
