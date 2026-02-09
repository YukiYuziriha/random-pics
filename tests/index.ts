/**
 * Test Suite Index
 * 
 * Re-exports all testing utilities and scenarios.
 */

export * from './types.ts';
export { ScenarioRunner, formatResults, exitWithResults } from './runner.ts';
export { HttpBackendAdapter } from './adapters/http.ts';
export { allScenarios as domainScenarios } from './scenarios/domain.ts';
export { apiScenarios } from './scenarios/api.ts';
export { createTestFixtures, cleanupTestFixtures } from './fixtures/images.ts';

// Combined all scenarios
import { allScenarios as domainScenarios } from './scenarios/domain.ts';
import { apiScenarios } from './scenarios/api.ts';

export const allScenarios = [...domainScenarios, ...apiScenarios];
