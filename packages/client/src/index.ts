import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient } from './client.js';
export * from './client.js';
export * from './config.js';
export * from './types.js';

export async function runClientDemo(): Promise<void> {
  console.log('='.repeat(65));
  console.log('   MCP CLIENT DEMO: AUTHENTICATION & AUTHORIZATION (RBAC)      ');
  console.log('='.repeat(65));

  // -------------------------------------------------------------
  // TEST 1: Admin Client (Full Permissions)
  // -------------------------------------------------------------
  console.log('\n>>> [TEST 1] Authenticating as ADMIN (token: "admin-token-secret-123")...');
  const adminClient = new McpClient({
    name: 'admin-client',
    authToken: 'admin-token-secret-123',
  });

  try {
    await adminClient.connect();
    console.log('✓ Successfully authenticated and connected as Administrator!');

    console.log('\n  → Admin calling tool: manage_notes (create note)...');
    const noteCreate = await adminClient.callTool('manage_notes', {
      action: 'create',
      title: 'Security Policy',
      content: 'RBAC and token authentication enabled across MCP endpoints.',
    });
    const parsedNote = JSON.parse(noteCreate.content[0]?.text ?? '{}');
    console.log(`    Result: Note created (ID: ${parsedNote.note?.id}, Author: ${parsedNote.createdBy})`);

    console.log('\n  → Admin reading restricted resource: config://server...');
    const configRes = await adminClient.readResource('config://server');
    console.log('    Result: Config accessed successfully by Admin.');

    console.log('\n  → Admin deleting note (Admin privilege)...');
    if (parsedNote.note?.id) {
      const deleteRes = await adminClient.callTool('manage_notes', {
        action: 'delete',
        id: parsedNote.note.id,
      });
      console.log('    Result:', deleteRes.content[0]?.text);
    }
  } catch (err) {
    console.error('Error during admin client test:', err);
  } finally {
    await adminClient.disconnect();
  }

  // -------------------------------------------------------------
  // TEST 2: Guest Client (Limited Permissions & Authorization Checks)
  // -------------------------------------------------------------
  console.log('\n' + '-'.repeat(65));
  console.log('>>> [TEST 2] Authenticating as GUEST (token: "guest-token-secret-789")...');
  const guestClient = new McpClient({
    name: 'guest-client',
    authToken: 'guest-token-secret-789',
  });

  try {
    await guestClient.connect();
    console.log('✓ Successfully authenticated as Guest (Read-Only role)!');

    console.log('\n  → Guest calling authorized tool: calculate (45 * 2)...');
    const calcResult = await guestClient.callTool('calculate', {
      operation: 'multiply',
      a: 45,
      b: 2,
    });
    console.log('    Result (Allowed):', calcResult.content[0]?.text);

    console.log('\n  → Guest attempting UNAUTHORIZED action: manage_notes (create note)...');
    const deniedNoteCreate = await guestClient.callTool('manage_notes', {
      action: 'create',
      title: 'Hacked Note',
      content: 'This should be blocked by authorization.',
    });
    if (deniedNoteCreate.isError) {
      console.log('    🛡️  Authorization Blocked Request (Expected):');
      console.log('       ', deniedNoteCreate.content[0]?.text);
    } else {
      console.warn('    ⚠️ Warning: Guest creation was not blocked!');
    }

    console.log('\n  → Guest attempting UNAUTHORIZED resource read: config://server...');
    try {
      await guestClient.readResource('config://server');
      console.warn('    ⚠️ Warning: Guest read config://server!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('    🛡️  Authorization Blocked Resource Read (Expected):');
      console.log('       ', msg);
    }
  } catch (err) {
    console.error('Error during guest client test:', err);
  } finally {
    await guestClient.disconnect();
  }

  // -------------------------------------------------------------
  // TEST 3: Invalid Token (Authentication Failure Check)
  // -------------------------------------------------------------
  console.log('\n' + '-'.repeat(65));
  console.log('>>> [TEST 3] Attempting connection with INVALID TOKEN...');
  const invalidClient = new McpClient({
    name: 'bad-client',
    authToken: 'invalid-token-xyz-999',
  });

  try {
    await invalidClient.connect();
    console.warn('⚠️ Warning: Invalid token was accepted!');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('🛡️  Authentication Correctly Rejected (Expected):');
    console.log('   ', msg.slice(0, 100) + '...');
  } finally {
    await invalidClient.disconnect().catch(() => {});
  }

  console.log('\n' + '='.repeat(65));
  console.log('✓ Authentication & Authorization test suite completed!');
  console.log('='.repeat(65));
}

// Auto-run only if this exact file was executed directly
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runClientDemo();
}
