import { authorize, type AuthUser } from './auth.js';
import { getAllNotes, getSystemDiagnostics } from './tools.js';

export const promptDefinitions = [
  {
    name: 'system_diagnostics',
    description: 'Generates a prompt for an LLM to evaluate server hardware health and memory pressure. (Requires prompts:system_diagnostics)',
    arguments: [
      {
        name: 'focus',
        description: 'Specific focus metric (e.g. "memory", "cpu", "general")',
        required: false,
      },
    ],
  },
  {
    name: 'summarize_notes',
    description: 'Generates a prompt containing current stored notes and requests an action-item summary. (Requires prompts:summarize_notes)',
    arguments: [
      {
        name: 'tone',
        description: 'Summary tone (e.g. "executive", "technical", "concise")',
        required: false,
      },
    ],
  },
];

export async function handleGetPrompt(
  name: string,
  args?: Record<string, string>,
  authUser?: AuthUser
): Promise<{
  description?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: { type: 'text'; text: string };
  }>;
}> {
  // Authorization check
  const requiredPermission = `prompts:${name}`;
  const authz = authorize(authUser, requiredPermission);
  if (!authz.allowed) {
    throw new Error(authz.reason || `Forbidden: Access to prompt template '${name}' denied.`);
  }

  switch (name) {
    case 'system_diagnostics': {
      const focus = args?.focus ?? 'general';
      const stats = getSystemDiagnostics();
      return {
        description: `System diagnostics analysis focusing on ${focus} (Requested by: ${authUser?.username})`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You are a DevOps Systems Engineer. Review the following system metrics with special focus on "${focus}":\n\n${JSON.stringify(
                stats,
                null,
                2
              )}\n\nPlease provide:\n1. Health status (Healthy / Warning / Critical)\n2. Memory and CPU evaluation\n3. Recommendations for optimization`,
            },
          },
        ],
      };
    }

    case 'summarize_notes': {
      const tone = args?.tone ?? 'concise';
      const notes = getAllNotes();
      return {
        description: `Notes summarization with ${tone} tone (Requested by: ${authUser?.username})`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please summarize the following stored notes in a ${tone} tone and identify any key decisions or follow-up action items:\n\n${JSON.stringify(
                notes,
                null,
                2
              )}`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Prompt template not found: ${name}`);
  }
}
