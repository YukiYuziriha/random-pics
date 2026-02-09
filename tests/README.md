# Behavior Tests

This directory contains behavior tests for the Bun HTTP backend.

## Test Categories

### Domain Behavior Scenarios (`scenarios/domain.ts`)

Tests the actual business logic:

- `folder_indexing` - Folder picking and image indexing
- `normal_traversal` - Sequential image navigation
- `random_traversal` - Random history building
- `random_lap_semantics` - Lap clearing when all images seen
- `force_random` - Force random bypasses history
- `state_persistence` - UI state save/load
- `reset_normal_history` - Normal history reset
- `reset_random_history` - Random history reset
- `full_wipe` - Complete data wipe
- `folder_navigation` - Folder history cycling
- `reindex_folder` - Reindexing updated files
- `current_image` - Current image retrieval

### API Integration Scenarios (`scenarios/api.ts`)

Tests the HTTP endpoint contract:

- `api_error_handling` - Error responses
- `api_image_data` - Valid image binary data
- `api_history_structure` - Response structure validation
- `api_state_fields` - All state fields handled
- `api_folder_info` - Folder info completeness
- `api_multi_folder` - Multiple folder tracking

## Running Tests

### Prerequisites

The backend server must be running:

```bash
bun server.ts
```

### Run All Tests

```bash
bun test
```

### Run Specific Categories

```bash
# Domain behavior tests only
bun run test:domain

# API integration tests only
bun run test:api
```

### List Available Scenarios

```bash
bun test --list
```

### Run Single Scenario

```bash
bun test folder_indexing
```

### CI Mode (JSON Output)

```bash
CI_OUTPUT=json bun run test:ci
```

## Environment Variables

- `TEST_API_URL` - Backend URL (default: `http://127.0.0.1:3000/api`)
- `CI_OUTPUT` - Set to `json` for CI-friendly output
- `RANDOM_PICS_DATA_DIR` - Data directory for test database

## Usage

Run the Bun backend first, then run tests:

```bash
bun server.ts
bun test
```

## Adding New Scenarios

1. Create scenario in appropriate file (`domain.ts` or `api.ts`):

```typescript
export const myScenario: Scenario = {
  name: 'my_scenario',
  description: 'What this tests',
  run: async (ctx) => {
    // Test code here
    ctx.expect.equal(actual, expected, 'message');
  },
};
```

2. Export from index:

```typescript
export { myScenario } from './scenarios/domain.ts';
```

3. Register in runner or add to `allScenarios` array

## Behavior Contract

These tests define the behavior contract for random-pics:

1. **Images**: After picking a folder, images are indexed and retrievable
2. **Normal Mode**: Sequential traversal wraps around
3. **Random Mode**: Builds navigable history with lap semantics
4. **State**: UI preferences persist across sessions
5. **Folders**: History tracked chronologically, navigation wraps
6. **Reset**: Operations clear appropriate state
7. **Wipe**: Removes all data but preserves app structure

## Key Principles

1. **Test Real Behavior**: Tests create actual images and verify real operations
2. **HTTP Contract Coverage**: Scenarios validate real Bun endpoint behavior
3. **Deterministic**: Each scenario cleans up after itself
4. **Fast**: Scenarios run in sequence to avoid DB conflicts
5. **CI Ready**: Exit codes and JSON output for automation
