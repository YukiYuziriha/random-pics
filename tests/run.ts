/**
 * Main Test Entry Point
 * 
 * Runs all behavior scenarios against the HTTP adapter.
 * This establishes the baseline behavior contract for the migration.
 * 
 * Usage:
 *   bun tests/run.ts          # Run all scenarios
 *   bun tests/run.ts --list   # List all scenarios
 *   bun tests/run.ts <name>   # Run specific scenario
 */

import { ScenarioRunner, formatResults, exitWithResults } from './runner.ts';
import { HttpBackendAdapter } from './adapters/http.ts';
import { allScenarios as domainScenarios } from './scenarios/domain.ts';
import { apiScenarios } from './scenarios/api.ts';

const allScenarios = [...domainScenarios, ...apiScenarios];

const API_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const listMode = args.includes('--list');
  const scenarioName = args.find(arg => !arg.startsWith('--'));
  
  // Create adapter
  const adapter = new HttpBackendAdapter(API_URL);
  
  // Check health
  console.log(`Connecting to ${API_URL}...`);
  const healthy = await adapter.isHealthy();
  if (!healthy) {
    console.error('ERROR: Cannot connect to backend server.');
    console.error('Make sure the server is running: bun server.ts');
    process.exit(1);
  }
  console.log('Connected successfully.\n');
  
  // Create runner
  const runner = new ScenarioRunner();
  
  if (listMode) {
    console.log('Available scenarios:');
    for (const scenario of allScenarios) {
      console.log(`  - ${scenario.name}: ${scenario.description}`);
    }
    process.exit(0);
  }
  
  // Register scenarios
  if (scenarioName) {
    const scenario = allScenarios.find(s => s.name === scenarioName);
    if (!scenario) {
      console.error(`Unknown scenario: ${scenarioName}`);
      console.error('Use --list to see available scenarios');
      process.exit(1);
    }
    runner.register(scenario);
    console.log(`Running scenario: ${scenarioName}\n`);
  } else {
    runner.registerAll(allScenarios);
    console.log(`Running ${allScenarios.length} scenarios...\n`);
  }
  
  // Run scenarios (sequential to avoid DB conflicts)
  const results = await runner.run(adapter, '');
  
  // Output results
  console.log(formatResults(results));
  
  // Exit with appropriate code
  exitWithResults(results);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
