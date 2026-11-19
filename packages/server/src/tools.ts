import os from 'node:os';
import { z } from 'zod';
import type { Note, SystemInfo, WeatherData } from './types.js';

// In-memory store for notes
const notesStore = new Map<string, Note>([
  [
    'welcome',
    {
      id: 'welcome',
      title: 'Welcome Note',
      content: 'Welcome to the TypeScript MCP Server demonstration!',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
]);

export function getSystemDiagnostics(): SystemInfo {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptimeSeconds: Math.floor(os.uptime()),
    cpuCount: os.cpus().length,
    totalMemoryMB: Math.round(totalMem / (1024 * 1024)),
    freeMemoryMB: Math.round(freeMem / (1024 * 1024)),
    usedMemoryMB: Math.round((totalMem - freeMem) / (1024 * 1024)),
    nodeVersion: process.version,
    processUptime: Math.floor(process.uptime()),
  };
}

export function getAllNotes(): Note[] {
  return Array.from(notesStore.values());
}

// Tool definitions for MCP ListTools
export const toolDefinitions = [
  {
    name: 'calculate',
    description: 'Perform mathematical operations including add, subtract, multiply, divide, power, and sqrt.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt'],
          description: 'The math operation to perform',
        },
        a: {
          type: 'number',
          description: 'The primary operand',
        },
        b: {
          type: 'number',
          description: 'The secondary operand (required for add, subtract, multiply, divide, power)',
        },
      },
      required: ['operation', 'a'],
    },
  },
  {
    name: 'get_system_info',
    description: 'Retrieve real-time host operating system information, CPU count, memory usage, and uptime.',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          description: 'Whether to include detailed CPU model information',
        },
      },
    },
  },
  {
    name: 'manage_notes',
    description: 'Create, read, list, or delete notes in the server storage.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'read', 'list', 'delete'],
          description: 'Action to perform on notes',
        },
        id: {
          type: 'string',
          description: 'Note identifier (required for read and delete)',
        },
        title: {
          type: 'string',
          description: 'Note title (used when creating a note)',
        },
        content: {
          type: 'string',
          description: 'Note content (used when creating a note)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'weather_report',
    description: 'Get current weather conditions and forecast for a specified city.',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name (e.g. "Tokyo", "London", "San Francisco")',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit (default: celsius)',
        },
      },
      required: ['city'],
    },
  },
];

// Calculation input validator
const CalculateArgsSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt']),
  a: z.number(),
  b: z.number().optional(),
});

// Notes input validator
const NotesArgsSchema = z.object({
  action: z.enum(['create', 'read', 'list', 'delete']),
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
});

// Weather input validator
const WeatherArgsSchema = z.object({
  city: z.string(),
  unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
});

export async function handleCallTool(
  name: string,
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'calculate': {
        const { operation, a, b } = CalculateArgsSchema.parse(args);
        let result: number;
        switch (operation) {
          case 'add':
            if (b === undefined) throw new Error("Argument 'b' is required for 'add'");
            result = a + b;
            break;
          case 'subtract':
            if (b === undefined) throw new Error("Argument 'b' is required for 'subtract'");
            result = a - b;
            break;
          case 'multiply':
            if (b === undefined) throw new Error("Argument 'b' is required for 'multiply'");
            result = a * b;
            break;
          case 'divide':
            if (b === undefined) throw new Error("Argument 'b' is required for 'divide'");
            if (b === 0) throw new Error('Division by zero is not permitted');
            result = a / b;
            break;
          case 'power':
            if (b === undefined) throw new Error("Argument 'b' is required for 'power'");
            result = Math.pow(a, b);
            break;
          case 'sqrt':
            if (a < 0) throw new Error('Square root of a negative number is undefined in real numbers');
            result = Math.sqrt(a);
            break;
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ operation, a, b, result }, null, 2),
            },
          ],
        };
      }

      case 'get_system_info': {
        const detailed = Boolean(args?.detailed);
        const sysInfo = getSystemDiagnostics();
        const payload: Record<string, unknown> = { ...sysInfo };
        if (detailed) {
          payload.cpus = os.cpus().map((cpu) => ({
            model: cpu.model,
            speedMHz: cpu.speed,
          }));
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      }

      case 'manage_notes': {
        const parsed = NotesArgsSchema.parse(args);
        switch (parsed.action) {
          case 'list': {
            const notes = getAllNotes();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ total: notes.length, notes }, null, 2),
                },
              ],
            };
          }
          case 'create': {
            if (!parsed.title || !parsed.content) {
              throw new Error("Both 'title' and 'content' are required to create a note");
            }
            const id = `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const newNote: Note = {
              id,
              title: parsed.title,
              content: parsed.content,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            notesStore.set(id, newNote);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ status: 'created', note: newNote }, null, 2),
                },
              ],
            };
          }
          case 'read': {
            if (!parsed.id) throw new Error("Argument 'id' is required to read a note");
            const note = notesStore.get(parsed.id);
            if (!note) throw new Error(`Note not found: ${parsed.id}`);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(note, null, 2),
                },
              ],
            };
          }
          case 'delete': {
            if (!parsed.id) throw new Error("Argument 'id' is required to delete a note");
            const existed = notesStore.delete(parsed.id);
            if (!existed) throw new Error(`Note not found: ${parsed.id}`);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ status: 'deleted', id: parsed.id }, null, 2),
                },
              ],
            };
          }
        }
        break;
      }

      case 'weather_report': {
        const { city, unit } = WeatherArgsSchema.parse(args);
        // Deterministic simulation based on city name hash
        let hash = 0;
        for (let i = 0; i < city.length; i++) {
          hash = (hash << 5) - hash + city.charCodeAt(i);
          hash |= 0;
        }
        const absHash = Math.abs(hash);
        const conditions = ['Sunny', 'Partly Cloudy', 'Overcast', 'Light Rain', 'Breezy', 'Clear Skies'];
        const condition = conditions[absHash % conditions.length];
        let tempC = (absHash % 28) + 5; // between 5°C and 32°C
        let temp = unit === 'fahrenheit' ? Math.round((tempC * 9) / 5 + 32) : tempC;

        const report: WeatherData = {
          city,
          temperature: temp,
          unit,
          condition,
          humidity: (absHash % 40) + 40,
          windSpeedKmh: (absHash % 25) + 5,
          timestamp: new Date().toISOString(),
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool '${name}': ${message}`,
        },
      ],
      isError: true,
    };
  }
}
