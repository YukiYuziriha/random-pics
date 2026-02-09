#!/usr/bin/env node
import { spawn } from 'child_process';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTests(testName, serverStartCmd, env, serverCwd) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Running ${testName} tests`);
  console.log('='.repeat(70));

  console.log('\nStarting backend...');
  const serverProc = spawn(serverStartCmd.command, serverStartCmd.args, {
    stdio: 'pipe',
    env: { ...process.env, ...env },
    cwd: serverCwd,
    detached: true,
  });

  serverProc.stdout.on('data', (data) => {
    process.stdout.write(`[Server] ${data}`);
  });

  serverProc.stderr.on('data', (data) => {
    process.stderr.write(`[Server Error] ${data}`);
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Running tests...\n');

  const testProc = spawn('bun', ['run', 'test:ci'], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    cwd: __dirname,
  });

  const testResult = await new Promise((resolve) => {
    testProc.on('close', (code) => {
      resolve({ success: code === 0, exitCode: code });
    });
    testProc.on('error', (err) => {
      resolve({ success: false, error: err.message, exitCode: -1 });
    });
  });

  console.log('\nStopping backend...');
  serverProc.kill();

  await new Promise(resolve => setTimeout(resolve, 2000));

  return testResult;
}

async function main() {
  const mode = process.argv[2] || 'bun';

  try {
    const serverCwd = mode === 'bun' ? join(__dirname, '..') : join(__dirname, '..', 'src-tauri');
    const testResult = await runTests(
      mode === 'bun' ? 'Bun Backend' : 'Rust Bridge',
      mode === 'bun'
        ? { command: 'bun', args: ['run', 'dev'] }
        : { command: 'cargo', args: ['run', '--bin', 'test-bridge'] },
      mode === 'bun'
        ? {}
        : { TEST_BRIDGE_PORT: '3000', RUST_LOG: 'debug' },
      serverCwd
    );

    const { success, exitCode, error } = testResult;

    console.log(`\n${'='.repeat(70)}`);
    console.log('TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`\nMode:     ${mode.toUpperCase()}`);
    console.log(`Result:   ${success ? 'PASS' : 'FAIL'}`);
    if (error) {
      console.log(`Error:    ${error}`);
    }
    console.log(`Exit Code: ${exitCode}`);
    console.log('='.repeat(70) + '\n');

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
