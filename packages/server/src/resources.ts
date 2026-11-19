import { authorize, type AuthUser } from './auth.js';
import { getAllNotes, getSystemDiagnostics } from './tools.js';

export const resourceDefinitions = [
  {
    uri: 'system://info',
    name: 'Live System Diagnostics',
    description: 'Real-time CPU, memory, OS, and process performance snapshot. (Requires resources:system://info)',
    mimeType: 'application/json',
  },
  {
    uri: 'notes://all',
    name: 'All Notes Database',
    description: 'Current collection of saved notes formatted as a JSON array. (Requires resources:notes://all)',
    mimeType: 'application/json',
  },
  {
    uri: 'config://server',
    name: 'Server Configuration',
    description: 'Server identification, protocol details, and security policies. (Admin only - Requires resources:config://server)',
    mimeType: 'application/json',
  },
];

export async function handleReadResource(
  uri: string,
  authUser?: AuthUser
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  // Authorization check
  const requiredPermission = `resources:${uri}`;
  const authz = authorize(authUser, requiredPermission);
  if (!authz.allowed) {
    throw new Error(authz.reason || `Forbidden: Access to resource '${uri}' denied.`);
  }

  switch (uri) {
    case 'system://info': {
      const diagnostics = getSystemDiagnostics();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(diagnostics, null, 2),
          },
        ],
      };
    }

    case 'notes://all': {
      const notes = getAllNotes();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ count: notes.length, notes }, null, 2),
          },
        ],
      };
    }

    case 'config://server': {
      const config = {
        name: 'mcp-ts-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
          auth: true,
        },
        security: {
          authenticatedUser: authUser?.username,
          role: authUser?.role,
        },
        uptimeSeconds: Math.floor(process.uptime()),
      };
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(config, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Resource not found for URI: ${uri}`);
  }
}
