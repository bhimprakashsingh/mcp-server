import type { McpHost } from './host.js';
import type { AgentResponse, AgentStep } from './types.js';

export class HostAgent {
  private host: McpHost;

  constructor(host: McpHost) {
    this.host = host;
  }

  /**
   * Safely parse JSON or return raw text if error or plain text.
   */
  private parseToolResponse(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  /**
   * Execute a user goal or natural-language query using available MCP tools.
   */
  async execute(query: string): Promise<AgentResponse> {
    const steps: AgentStep[] = [];
    const normalized = query.toLowerCase().trim();

    // 1. Math calculation queries
    const mathMatch = normalized.match(
      /(?:calculate|what is|compute)?\s*([0-9.]+)\s*(\+|\-|\*|\/|\^|x)\s*([0-9.]+)/i
    );
    const sqrtMatch = normalized.match(/(?:sqrt|square root of)\s*([0-9.]+)/i);

    if (mathMatch) {
      const a = parseFloat(mathMatch[1]);
      const opSymbol = mathMatch[2];
      const b = parseFloat(mathMatch[3]);
      const opMap: Record<string, string> = {
        '+': 'add',
        '-': 'subtract',
        '*': 'multiply',
        x: 'multiply',
        '/': 'divide',
        '^': 'power',
      };
      const operation = opMap[opSymbol] ?? 'add';

      steps.push({
        step: 1,
        thought: `Identified arithmetic request: ${a} ${opSymbol} ${b}. Calling MCP tool 'calculate'.`,
        toolCall: {
          name: 'calculate',
          arguments: { operation, a, b },
        },
      });

      const result = await this.host.callTool('calculate', { operation, a, b });
      const rawText = result.content[0]?.text ?? '{}';
      if (result.isError) {
        steps[0].toolResult = { error: rawText };
        return { query, steps, answer: `⚠️ ${rawText}` };
      }

      const parsed = this.parseToolResponse(rawText);
      steps[0].toolResult = parsed;

      return {
        query,
        steps,
        answer: `The calculation result for ${a} ${opSymbol} ${b} is **${parsed.result}**.`,
      };
    }

    if (sqrtMatch) {
      const a = parseFloat(sqrtMatch[1]);
      steps.push({
        step: 1,
        thought: `Identified square root request: sqrt(${a}). Calling MCP tool 'calculate'.`,
        toolCall: {
          name: 'calculate',
          arguments: { operation: 'sqrt', a },
        },
      });

      const result = await this.host.callTool('calculate', { operation: 'sqrt', a });
      const rawText = result.content[0]?.text ?? '{}';
      if (result.isError) {
        steps[0].toolResult = { error: rawText };
        return { query, steps, answer: `⚠️ ${rawText}` };
      }

      const parsed = this.parseToolResponse(rawText);
      steps[0].toolResult = parsed;

      return {
        query,
        steps,
        answer: `The square root of ${a} is **${parsed.result}**.`,
      };
    }

    // 2. Weather queries
    const weatherMatch = normalized.match(/(?:weather in|weather for|temperature in)\s+([a-zA-Z\s]+)/i);
    if (weatherMatch || normalized.includes('weather')) {
      const city = weatherMatch ? weatherMatch[1].trim() : 'San Francisco';
      steps.push({
        step: 1,
        thought: `User requested weather information for '${city}'. Calling MCP tool 'weather_report'.`,
        toolCall: {
          name: 'weather_report',
          arguments: { city, unit: 'celsius' },
        },
      });

      const result = await this.host.callTool('weather_report', { city, unit: 'celsius' });
      const rawText = result.content[0]?.text ?? '{}';
      if (result.isError) {
        steps[0].toolResult = { error: rawText };
        return { query, steps, answer: `⚠️ ${rawText}` };
      }

      const weather = this.parseToolResponse(rawText) as Record<string, unknown>;
      steps[0].toolResult = weather;

      return {
        query,
        steps,
        answer: `Weather in **${weather.city}**: Condition is **${weather.condition}** with temperature of **${weather.temperature}°C** (Humidity: ${weather.humidity}%, Wind: ${weather.windSpeedKmh} km/h).`,
      };
    }

    // 3. System diagnostics / Info
    if (
      normalized.includes('system') ||
      normalized.includes('specs') ||
      normalized.includes('memory') ||
      normalized.includes('cpu') ||
      normalized.includes('hardware')
    ) {
      steps.push({
        step: 1,
        thought: `User requested system telemetry. Calling MCP tool 'get_system_info'.`,
        toolCall: {
          name: 'get_system_info',
          arguments: { detailed: true },
        },
      });

      const result = await this.host.callTool('get_system_info', { detailed: true });
      const rawText = result.content[0]?.text ?? '{}';
      if (result.isError) {
        steps[0].toolResult = { error: rawText };
        return { query, steps, answer: `⚠️ ${rawText}` };
      }

      const sys = this.parseToolResponse(rawText) as Record<string, unknown>;
      steps[0].toolResult = sys;

      const uptimeMinutes = typeof sys.uptimeSeconds === 'number' ? Math.floor(sys.uptimeSeconds / 60) : 0;
      return {
        query,
        steps,
        answer: `**System Diagnostics Summary:**\n- **OS:** ${sys.platform} (${sys.arch}, release ${sys.release})\n- **CPU Cores:** ${sys.cpuCount}\n- **Memory:** ${sys.usedMemoryMB} MB used / ${sys.totalMemoryMB} MB total (${sys.freeMemoryMB} MB free)\n- **Host Uptime:** ${uptimeMinutes} minutes\n- **Node Version:** ${sys.nodeVersion}`,
      };
    }

    // 4. Notes management
    if (normalized.includes('note') || normalized.includes('notes')) {
      if (normalized.includes('create') || normalized.includes('add') || normalized.includes('new')) {
        const titleMatch = query.match(/title[:\s]+['"]([^'"]+)['"]/i) || query.match(/note\s+['"]([^'"]+)['"]/i);
        const title = titleMatch ? titleMatch[1] : 'Quick Note';
        const contentMatch =
          query.match(/content[:\s]+['"]([^'"]+)['"]/i) || query.match(/with\s+['"]([^'"]+)['"]/i);
        const content = contentMatch ? contentMatch[1] : query;

        steps.push({
          step: 1,
          thought: `Creating note with title "${title}". Calling MCP tool 'manage_notes'.`,
          toolCall: {
            name: 'manage_notes',
            arguments: { action: 'create', title, content },
          },
        });

        const result = await this.host.callTool('manage_notes', { action: 'create', title, content });
        const rawText = result.content[0]?.text ?? '{}';
        if (result.isError) {
          steps[0].toolResult = { error: rawText };
          return { query, steps, answer: `⚠️ ${rawText}` };
        }

        const parsed = this.parseToolResponse(rawText) as { note?: { id: string } };
        steps[0].toolResult = parsed;

        return {
          query,
          steps,
          answer: `Successfully created note **"${title}"** (ID: \`${parsed.note?.id}\`).`,
        };
      } else {
        // List notes
        steps.push({
          step: 1,
          thought: `Listing all stored notes. Calling MCP tool 'manage_notes'.`,
          toolCall: {
            name: 'manage_notes',
            arguments: { action: 'list' },
          },
        });

        const result = await this.host.callTool('manage_notes', { action: 'list' });
        const rawText = result.content[0]?.text ?? '{}';
        if (result.isError) {
          steps[0].toolResult = { error: rawText };
          return { query, steps, answer: `⚠️ ${rawText}` };
        }

        const parsed = this.parseToolResponse(rawText) as {
          total?: number;
          notes?: Array<{ id: string; title: string; content: string }>;
        };
        steps[0].toolResult = parsed;

        const noteSummaries = (parsed.notes || [])
          .map((n) => `- **${n.title}** (\`${n.id}\`): ${n.content}`)
          .join('\n');

        return {
          query,
          steps,
          answer: `**Stored Notes (${parsed.total || 0}):**\n${noteSummaries || 'No notes currently stored.'}`,
        };
      }
    }

    // Default fallback
    return {
      query,
      steps: [
        {
          step: 1,
          thought: 'No direct tool mapping found for query. Suggesting available capabilities.',
        },
      ],
      answer: `I could not determine a specific tool for: "${query}". Try asking:\n- "Calculate 15 * 34"\n- "What is the square root of 144?"\n- "What's the weather in London?"\n- "Show system information"\n- "Create note 'TODO' with 'Review MCP host'"`,
    };
  }
}
