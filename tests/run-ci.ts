/**
 * CI Test Runner
 * 
 * Runs all tests with CI-friendly output (JSON and exit codes).
 * Used in CI pipelines to enforce behavior parity gates.
 */

import { ScenarioRunner } from './runner.ts';
import { HttpBackendAdapter } from './adapters/http.ts';
import { allScenarios } from './index.ts';

const API_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api';

interface CIReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
  results: Array<{
    name: string;
    passed: boolean;
    error: string | undefined;
    duration: number;
  }>;
  exitCode: number;
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const adapter = new HttpBackendAdapter(API_URL);
  
  // Health check
  const healthy = await adapter.isHealthy();
  if (!healthy) {
    const report: CIReport = {
      summary: { total: 0, passed: 0, failed: 0, duration: 0 },
      results: [],
      exitCode: 1,
    };
    
    if (process.env.CI_OUTPUT === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error('ERROR: Cannot connect to backend server at', API_URL);
    }
    
    process.exit(1);
  }
  
  // Run all scenarios
  const runner = new ScenarioRunner();
  runner.registerAll(allScenarios);
  
  const results = await runner.run(adapter, '');
  const duration = Date.now() - startTime;
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  const report: CIReport = {
    summary: {
      total: results.length,
      passed,
      failed,
      duration,
    },
    results,
    exitCode: failed > 0 ? 1 : 0,
  };
  
  // Output based on CI_OUTPUT environment variable
  if (process.env.CI_OUTPUT === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Human-readable output
    console.log('\n' + '='.repeat(70));
    console.log('CI TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`\nSummary: ${passed}/${results.length} passed (${duration}ms)`);
    
    if (failed > 0) {
      console.log('\nFAILED SCENARIOS:');
      for (const result of results.filter(r => !r.passed)) {
        console.log(`  ✗ ${result.name}: ${result.error || 'Unknown error'}`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
  }
  
  process.exit(report.exitCode);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
