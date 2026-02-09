/**
 * Tauri Command Test Runner
 * 
 * Runs all behavior scenarios against Tauri invoke commands.
 * This verifies Rust backend parity with Bun implementation.
 * 
 * Usage:
 *   bun tests/run-tauri.ts          # Run all scenarios
 *   bun tests/run-tauri.ts --list   # List all scenarios
 *   bun tests/run-tauri.ts <name>   # Run specific scenario
 */

import { ScenarioRunner, formatResults, exitWithResults } from './runner.ts';
import { TauriCommandAdapter } from './adapters/tauri.ts';
import { allScenarios as domainScenarios } from './scenarios/domain.ts';
import { apiScenarios } from './scenarios/api.ts';

const allScenarios = [...domainScenarios, ...apiScenarios];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const listMode = args.includes('--list');
  const scenarioName = args.find(arg => !arg.startsWith('--'));
  
  // Create adapter
  const adapter = new TauriCommandAdapter();
  
  // Check health
  console.log('Testing Tauri command backend...');
  const healthy = await adapter.isHealthy();
  if (!healthy) {
    console.error('ERROR: Tauri backend is not healthy.');
    console.error('Make sure the app is running and ImageLoader is initialized.');
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
    console.log(`Running ${allScenarios.length} scenarios against Tauri backend...\n`);
  }
  
  // Run scenarios (sequential to avoid DB conflicts)
  const results = await runner.run(adapter, 'tauri:');
  
  // Output results
  console.log(formatResults(results));
  
  // Exit with appropriate code
  exitWithResults(results);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
