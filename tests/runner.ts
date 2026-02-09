/**
 * Scenario Runner
 * 
 * Executes test scenarios against a BackendAdapter and collects results.
 * This is transport-agnostic - works with both HTTP and Tauri adapters.
 */

import type { BackendAdapter, Scenario, ScenarioResult, TestContext } from './types.ts';

export class ScenarioRunner {
  private scenarios: Scenario[] = [];
  
  register(scenario: Scenario): void {
    this.scenarios.push(scenario);
  }
  
  registerAll(scenarios: Scenario[]): void {
    this.scenarios.push(...scenarios);
  }
  
  async run(adapter: BackendAdapter, testDataDir: string): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];
    
    for (const scenario of this.scenarios) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;
      
      try {
        const ctx = createTestContext(adapter, testDataDir);
        await scenario.run(ctx);
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        passed = false;
      }
      
      results.push({
        name: scenario.name,
        passed,
        error,
        duration: Date.now() - startTime,
      });
    }
    
    return results;
  }
  
  async runParallel(adapter: BackendAdapter, testDataDir: string): Promise<ScenarioResult[]> {
    // Run scenarios in parallel for speed
    const promises = this.scenarios.map(async (scenario) => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;
      
      try {
        const ctx = createTestContext(adapter, testDataDir);
        await scenario.run(ctx);
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        passed = false;
      }
      
      return {
        name: scenario.name,
        passed,
        error,
        duration: Date.now() - startTime,
      };
    });
    
    return Promise.all(promises);
  }
  
  getScenarioNames(): string[] {
    return this.scenarios.map(s => s.name);
  }
}

function createTestContext(adapter: BackendAdapter, testDataDir: string): TestContext {
  return {
    adapter,
    testDataDir,
    expect: {
      equal: (actual: unknown, expected: unknown, message?: string) => {
        if (actual !== expected) {
          throw new Error(
            message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
          );
        }
      },
      true: (value: boolean, message?: string) => {
        if (!value) {
          throw new Error(message || `Expected true, got false`);
        }
      },
      false: (value: boolean, message?: string) => {
        if (value) {
          throw new Error(message || `Expected false, got true`);
        }
      },
      throws: async (fn: () => Promise<unknown>, message?: string) => {
        let threw = false;
        try {
          await fn();
        } catch {
          threw = true;
        }
        if (!threw) {
          throw new Error(message || 'Expected function to throw');
        }
      },
      arrayContains: <T>(array: T[], item: T, message?: string) => {
        if (!array.includes(item)) {
          throw new Error(
            message || `Expected array to contain ${JSON.stringify(item)}`
          );
        }
      },
    },
  };
}

/**
 * Format results for console output
 */
export function formatResults(results: ScenarioResult[]): string {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  let output = '\n' + '='.repeat(60) + '\n';
  output += `SCENARIO RESULTS: ${passed}/${total} passed\n`;
  output += '='.repeat(60) + '\n\n';
  
  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    output += `${status}: ${result.name} (${result.duration}ms)\n`;
    if (result.error) {
      output += `  Error: ${result.error}\n`;
    }
  }
  
  output += '\n' + '='.repeat(60) + '\n';
  output += `Total: ${total} | Passed: ${passed} | Failed: ${failed}\n`;
  output += '='.repeat(60) + '\n';
  
  return output;
}

/**
 * Exit with appropriate code based on results
 */
export function exitWithResults(results: ScenarioResult[]): never {
  const failed = results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}
