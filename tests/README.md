# Behavior Tests

This directory contains the behavior test suite for random-pics. These tests establish the **baseline behavior contract** that must be preserved during the migration from Bun HTTP backend to Rust Tauri commands.

## Architecture

The test suite uses a **transport-agnostic scenario runner** pattern:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Scenarios     │────▶│  BackendAdapter │◄────│  HTTP Adapter   │
│  (Behavior)     │     │   (Interface)   │     │ (Current Impl)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │ Command Adapter │
                        │  (Future Impl)  │
                        └─────────────────┘
```

This allows the **same scenarios** to run against both implementations to verify parity.

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

## Migration Usage

### Phase 0 (Current): Baseline Lock

Run tests against current Bun implementation:

```bash
# Verify all scenarios pass
bun run test:ci
```

All scenarios must pass before proceeding with migration.

### Phase 0.5: Dual-Path Parity

When Rust backend is ready:

1. Create `TauriCommandAdapter` implementing `BackendAdapter`
2. Run scenarios against both adapters
3. Compare results for parity

```typescript
// Example dual-path test
const httpResults = await runner.run(httpAdapter, '');
const tauriResults = await runner.run(tauriAdapter, '');

// Assert parity
assertParity(httpResults, tauriResults);
```

### Phase 4: Cutover Gate

After switching to Tauri commands:

1. Remove HTTP adapter usage
2. Keep scenario suite as regression tests
3. CI enforces all scenarios pass

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

These tests define the **behavior contract** for random-pics:

1. **Images**: After picking a folder, images are indexed and retrievable
2. **Normal Mode**: Sequential traversal wraps around
3. **Random Mode**: Builds navigable history with lap semantics
4. **State**: UI preferences persist across sessions
5. **Folders**: History tracked chronologically, navigation wraps
6. **Reset**: Operations clear appropriate state
7. **Wipe**: Removes all data but preserves app structure

Any new implementation (Rust Tauri) must satisfy all these scenarios.

## Key Principles

1. **Test Real Behavior**: Tests create actual images and verify real operations
2. **Transport Agnostic**: Same scenarios work with HTTP or Tauri commands
3. **Deterministic**: Each scenario cleans up after itself
4. **Fast**: Scenarios run in sequence to avoid DB conflicts
5. **CI Ready**: Exit codes and JSON output for automation
