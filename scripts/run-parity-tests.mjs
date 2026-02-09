#!/usr/bin/env node
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runCommand(cmd, args, env) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: __dirname,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function main() {
  const mode = process.argv[2] || 'both';

  const testResults = {
    bun: null,
    rustBridge: null,
    timestamp: new Date().toISOString(),
  };

  try {
    console.log('\n' + '='.repeat(70));
    console.log('PARITY TEST RUNNER');
    console.log('='.repeat(70) + '\n');

    if (mode === 'bun' || mode === 'both') {
      console.log('\n--- Testing Bun Backend ---');
      const bunServerProc = spawn('bun', ['run', 'dev'], {
        cwd: join(__dirname, '..'),
        detached: true,
      });
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        await runCommand('bun', ['run', 'test:ci'], { TEST_API_URL: 'http://127.0.0.1:3000/api' });
        testResults.bun = { success: true };
      } catch (error) {
        testResults.bun = { success: false, error: error.message };
      }

      bunServerProc.kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (mode === 'rust-bridge' || mode === 'both') {
      console.log('\n--- Testing Rust Bridge ---');
      const bridgeProc = spawn('node', ['tests/tauri-test-bridge.js'], {
        cwd: join(__dirname, '..'),
        detached: true,
        env: { TEST_BRIDGE_PORT: '3000' },
      });
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        await runCommand('bun', ['run', 'test:ci'], { TEST_API_URL: 'http://127.0.0.1:3000/api' });
        testResults.rustBridge = { success: true };
      } catch (error) {
        testResults.rustBridge = { success: false, error: error.message };
      }

      bridgeProc.kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n' + '='.repeat(70));
    console.log('PARITY REPORT');
    console.log('='.repeat(70));

    if (testResults.bun && testResults.rustBridge) {
      const bunPassed = testResults.bun.success;
      const rustPassed = testResults.rustBridge.success;

      console.log(`\nBun Backend:     ${bunPassed ? 'PASS' : 'FAIL'}`);
      console.log(`Rust Bridge:      ${rustPassed ? 'PASS' : 'FAIL'}`);

      if (testResults.bun.error) {
        console.log(`\nBun Error:\n  ${testResults.bun.error}`);
      }
      if (testResults.rustBridge.error) {
        console.log(`\nRust Bridge Error:\n  ${testResults.rustBridge.error}`);
      }

      const parity = bunPassed === rustPassed;
      console.log(`\nParity:          ${parity ? 'MATCH' : 'MISMATCH'}`);

      if (!parity) {
        console.log('\n⚠️  PARITY DETECTED: Both backends should have same result!');
      }

      console.log('\n' + '='.repeat(70));

      if (parity && bunPassed) {
        console.log('SUCCESS: All tests passed with parity confirmed');
        process.exit(0);
      } else if (!bunPassed && !rustPassed) {
        console.log('FAIL: Both backends failed');
        process.exit(1);
      } else if (!parity) {
        console.log('FAIL: Parity mismatch detected');
        process.exit(1);
      } else {
        console.log('FAIL: Tests failed');
        process.exit(1);
      }
    } else {
      console.log('\nERROR: Could not collect results from both backends');
      process.exit(1);
    }
  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
