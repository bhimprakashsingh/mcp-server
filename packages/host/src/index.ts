#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { HostAgent } from './agent.js';
import { McpHost } from './host.js';
export * from './host.js';
export * from './agent.js';
export * from './types.js';

async function runDemoMode(host: McpHost, agent: HostAgent) {
  console.log('='.repeat(65));
  console.log('            MCP HOST & AGENT AUTOMATED DEMONSTRATION           ');
  console.log('='.repeat(65));

  console.log('\n[Host Init] Starting MCP Host and discovering server capabilities...');
  await host.start();

  console.log('\n[Catalog] Aggregated Registry:');
  console.log('  Available Tools:');
  for (const tool of host.getTools()) {
    console.log(`    • ${tool.name} (from: ${tool.serverId}) - ${tool.description}`);
  }
  console.log('  Available Resources:');
  for (const res of host.getResources()) {
    console.log(`    • ${res.uri} - ${res.name}`);
  }
  console.log('  Available Prompts:');
  for (const p of host.getPrompts()) {
    console.log(`    • ${p.name} - ${p.description}`);
  }

  const demoQueries = [
    'Calculate 25 * 16',
    'What is the square root of 256?',
    "What's the weather in Tokyo?",
    'Show system memory and hardware specs',
    'Create note \'Architecture\' with \'Model Context Protocol TypeScript project\'',
    'List all current notes',
  ];

  console.log('\n' + '-'.repeat(65));
  console.log('         RUNNING AGENT REASONING & TOOL EXECUTION LOOP         ');
  console.log('-'.repeat(65));

  for (let i = 0; i < demoQueries.length; i++) {
    const query = demoQueries[i];
    console.log(`\n[Agent Turn ${i + 1}] User Query: "${query}"`);
    const response = await agent.execute(query);

    for (const step of response.steps) {
      console.log(`  🤔 Agent Thought: ${step.thought}`);
      if (step.toolCall) {
        console.log(`  🔧 Dispatched Tool: ${step.toolCall.name}(${JSON.stringify(step.toolCall.arguments)})`);
      }
    }
    console.log(`  💬 Final Answer: ${response.answer}`);
  }

  console.log('\n' + '-'.repeat(65));
  console.log('                 HOST RESOURCE & PROMPT ACCESS                 ');
  console.log('-'.repeat(65));

  console.log('\n[Host Resource Read] Querying config://server...');
  const configRes = await host.readResource('config://server');
  console.log('  Resource text:', configRes[0]?.text);

  console.log('\n[Host Prompt Retrieval] Fetching prompt summarize_notes...');
  const promptRes = await host.getPrompt('summarize_notes', { tone: 'executive' });
  console.log('  Prompt description:', promptRes.description);
  const promptText = promptRes.messages[0]?.content.type === 'text' ? promptRes.messages[0].content.text : '';
  console.log('  Prompt preview:', promptText.slice(0, 120) + '...');

  console.log('\n' + '='.repeat(65));
  console.log('✓ MCP Host demonstration completed successfully!');
  console.log('='.repeat(65));
}

async function runInteractiveRepl(host: McpHost, agent: HostAgent) {
  console.log('='.repeat(65));
  console.log('                     MCP HOST INTERACTIVE CLI                  ');
  console.log('='.repeat(65));
  console.log('Connecting to MCP server(s)...');
  await host.start();
  console.log('✓ MCP Host ready!');
  console.log('\nType your query or commands:');
  console.log('  /tools       - List all available tools');
  console.log('  /resources   - List all available resources');
  console.log('  /prompts     - List all available prompts');
  console.log('  /read <uri>  - Read a resource directly');
  console.log('  /exit        - Exit the host\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'mcp-host> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === '/exit' || input === 'exit') {
      rl.close();
      return;
    }

    if (input === '/tools') {
      console.log('\nAvailable Tools:');
      for (const t of host.getTools()) {
        console.log(`  - ${t.name}: ${t.description}`);
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/resources') {
      console.log('\nAvailable Resources:');
      for (const r of host.getResources()) {
        console.log(`  - ${r.uri}: ${r.description}`);
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/prompts') {
      console.log('\nAvailable Prompts:');
      for (const p of host.getPrompts()) {
        console.log(`  - ${p.name}: ${p.description}`);
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/whoami') {
      const token = process.env.MCP_AUTH_TOKEN || 'admin-token-secret-123';
      console.log(`\nActive Auth Token: ${token}`);
      console.log('Role Directory:');
      console.log('  admin-token-secret-123 -> Admin (Full Access)');
      console.log('  user-token-secret-456  -> Developer (Standard Access)');
      console.log('  guest-token-secret-789 -> Guest (Read-Only Access)\n');
      rl.prompt();
      return;
    }

    if (input.startsWith('/read ')) {
      const uri = input.slice(6).trim();
      try {
        const contents = await host.readResource(uri);
        console.log(`\nResource [${uri}]:\n${contents[0]?.text ?? '(empty)'}\n`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error reading resource: ${msg}`);
      }
      rl.prompt();
      return;
    }

    // Agent execution for natural language
    try {
      const response = await agent.execute(input);
      for (const step of response.steps) {
        if (step.toolCall) {
          console.log(`\n[Agent -> Tool] Calling ${step.toolCall.name}`);
        }
      }
      console.log(`\n${response.answer}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error executing agent query: ${msg}`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\nShutting down MCP Host...');
    await host.stop();
    console.log('Host stopped.');
    process.exit(0);
  });
}

export async function main() {
  const tokenArg = process.argv.find((arg) => arg.startsWith('--token='));
  const explicitToken = tokenArg ? tokenArg.split('=')[1] : undefined;

  const host = new McpHost(explicitToken);
  const agent = new HostAgent(host);
  const isDemo = process.argv.includes('--demo');

  const shutdown = async () => {
    console.log('\nExiting...');
    await host.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    if (isDemo) {
      await runDemoMode(host, agent);
      await host.stop();
    } else {
      await runInteractiveRepl(host, agent);
    }
  } catch (error) {
    console.error('Fatal host error:', error);
    await host.stop();
    process.exit(1);
  }
}

// Auto-run only when executed directly
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  main();
}
