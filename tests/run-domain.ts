/**
 * Domain Tests Runner
 * 
 * Runs only domain behavior scenarios (excluding API integration tests).
 */

import { ScenarioRunner, formatResults, exitWithResults } from './runner.ts';
import { HttpBackendAdapter } from './adapters/http.ts';
import { allScenarios as domainScenarios } from './scenarios/domain.ts';

const API_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api';

async function main(): Promise<void> {
  const adapter = new HttpBackendAdapter(API_URL);
  
  console.log(`Running domain behavior scenarios against ${API_URL}...\n`);
  
  const healthy = await adapter.isHealthy();
  if (!healthy) {
    console.error('ERROR: Cannot connect to backend server.');
    console.error('Make sure the server is running: bun server.ts');
    process.exit(1);
  }
  
  const runner = new ScenarioRunner();
  runner.registerAll(domainScenarios);
  
  const results = await runner.run(adapter, '');
  console.log(formatResults(results));
  
  exitWithResults(results);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
