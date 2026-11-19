import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient } from './client.js';
export * from './client.js';
export * from './types.js';
export * from './config.js';

export async function runClientDemo(): Promise<void> {
  console.log('='.repeat(60));
  console.log('         MCP CLIENT DEMONSTRATION & TEST SUITE         ');
  console.log('='.repeat(60));

  const client = new McpClient();

  try {
    console.log('\n[1/6] Connecting to MCP Server via Stdio transport...');
    await client.connect();
    console.log('✓ Successfully connected and completed MCP handshake!');

    console.log('\n[2/6] Sending Ping...');
    await client.ping();
    console.log('✓ Ping response received. Server is responsive.');

    console.log('\n[3/6] Discovering available Tools...');
    const tools = await client.listTools();
    console.log(`✓ Discovered ${tools.length} tools:`);
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
    }

    console.log('\n[4/6] Executing Tool Calls...');
    // A. calculate
    console.log('  → Calling tool: calculate (multiply 18 * 24)...');
    const calcResult = await client.callTool('calculate', {
      operation: 'multiply',
      a: 18,
      b: 24,
    });
    console.log('    Result:', calcResult.content[0]?.text);

    // B. get_system_info
    console.log('\n  → Calling tool: get_system_info (detailed: false)...');
    const sysResult = await client.callTool('get_system_info', { detailed: false });
    const sysData = JSON.parse(sysResult.content[0]?.text ?? '{}');
    console.log(
      `    Result: OS=${sysData.platform} (${sysData.arch}), Node=${sysData.nodeVersion}, CPUs=${sysData.cpuCount}, Memory=${sysData.usedMemoryMB}MB / ${sysData.totalMemoryMB}MB`
    );

    // C. manage_notes
    console.log('\n  → Calling tool: manage_notes (create note)...');
    const noteCreate = await client.callTool('manage_notes', {
      action: 'create',
      title: 'Sprint Planning',
      content: 'Discuss MCP host and client integration architecture.',
    });
    console.log('    Created Note:', noteCreate.content[0]?.text);

    // D. weather_report
    console.log('\n  → Calling tool: weather_report (city: "Seattle", unit: "celsius")...');
    const weatherResult = await client.callTool('weather_report', {
      city: 'Seattle',
      unit: 'celsius',
    });
    console.log('    Weather:', weatherResult.content[0]?.text);

    console.log('\n[5/6] Reading Resources...');
    const resources = await client.listResources();
    console.log(`✓ Discovered ${resources.length} resources:`);
    for (const res of resources) {
      console.log(`  - ${res.uri} (${res.name}): ${res.description}`);
    }

    console.log('  → Reading resource: system://info...');
    const resourceContent = await client.readResource('system://info');
    console.log('    Content snippet:', resourceContent[0]?.text?.slice(0, 150) + '...');

    console.log('\n[6/6] Inspecting Prompts...');
    const prompts = await client.listPrompts();
    console.log(`✓ Discovered ${prompts.length} prompt templates:`);
    for (const prompt of prompts) {
      console.log(`  - ${prompt.name}: ${prompt.description}`);
    }

    console.log('  → Fetching prompt: system_diagnostics (focus: "memory")...');
    const promptData = await client.getPrompt('system_diagnostics', { focus: 'memory' });
    console.log('    Rendered Prompt message:');
    const firstMsg = promptData.messages[0];
    const preview = firstMsg && firstMsg.content.type === 'text' ? firstMsg.content.text : '';
    console.log('    ' + preview.replace(/\n/g, '\n    '));

    console.log('\n' + '='.repeat(60));
    console.log('✓ All MCP Client operations completed successfully!');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('Error during client demonstration:', err);
    process.exitCode = 1;
  } finally {
    console.log('\nClosing client connection...');
    await client.disconnect();
    console.log('Client disconnected gracefully.');
  }
}

// Auto-run only if this exact file was executed directly
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runClientDemo();
}
