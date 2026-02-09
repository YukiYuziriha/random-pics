# Parity Testing Guide

This guide explains how to run parity tests for Phase 3.5 of the migration.

## Quick Start

### Test Bun Backend (Baseline)
```bash
bun run test:bun
```

This will:
1. Start the Bun server on port 3000
2. Run all 18 scenarios against it
3. Report results

**Expected**: All 18 scenarios should pass

## Implementation Status

See `PARITY_IMPLEMENTATION_STATUS.md` for detailed status.

## What's Been Implemented

✅ **Test Infrastructure**
- Dual-path test runners in `scripts/`
- Parity comparison script (`run-parity-tests.mjs`)
- Test scripts added to package.json

✅ **Contract Compliance**
- All 18 endpoints mapped
- JSON camelCase naming verified
- Status code semantics (404 for no folder, etc.)

✅ **Bun Baseline**
- All 18 scenarios passing (~800ms)
- Test suite verified working

## What's In Progress

⏳ **Rust HTTP Bridge**
- Need to complete `src-tauri/src/test_bridge.rs`
- Compilation issues with async/DB interaction
- See resolution options in PARITY_IMPLEMENTATION_STATUS.md

⏳ **Folder Selection Regression**
- Known bug: after pick_folder, subsequent ops act as if no folder selected
- Likely in `src-tauri/src/img_loader.rs` around state persistence
- This blocks reliable parity testing

## Running Tests

### Individual Backend Tests

```bash
# Test Bun backend
bun run test:bun

# Test Rust bridge (when implemented)
bun run test:rust-bridge
```

### Full Parity Comparison

```bash
# Run both and compare
bun run test:parity
```

This script will:
1. Run Bun backend tests
2. Run Rust bridge tests
3. Compare results
4. Report parity status

### CI Integration

Once bridge is working, add to `.github/workflows/`:

```yaml
- name: Parity Tests
  run: bun run test:parity
```

## Test Contract Reference

From `tests/adapters/http.ts`, the HTTP contract is:

### Folder Operations
| Endpoint | Method | Status on No Result |
|----------|--------|-------------------|
| /api/pick_folder | POST | 500 |
| /api/next_folder | GET | 404 |
| /api/prev_folder | GET | 404 |
| /api/folder_history | GET | N/A |
| /api/reindex_current_folder | POST | 500 |

### Image Operations
| Endpoint | Method | Return Type |
|----------|--------|-------------|
| /api/current_image | GET | image/jpeg bytes |
| /api/next | GET | image/jpeg bytes |
| /api/prev | GET | image/jpeg bytes |
| /api/next_random | GET | image/jpeg bytes |
| /api/prev_random | GET | image/jpeg bytes |
| /api/force_random | GET | image/jpeg bytes |

### History Operations
| Endpoint | Method | Notes |
|----------|--------|-------|
| /api/normal_history | GET | Returns { history: string[], currentIndex: number } |
| /api/random_history | GET | Returns { history: string[], currentIndex: number } |
| /api/reset_normal_history | POST | N/A |
| /api/reset_random_history | POST | N/A |

### State Operations
| Endpoint | Method | Notes |
|----------|--------|-------|
| /api/state | GET | Returns all state fields with camelCase |
| /api/state | POST | Accepts full state payload |

### Destructive Operations
| Endpoint | Method | Notes |
|----------|--------|-------|
| /api/full_wipe | POST | Clears all data |

## JSON Field Mapping

All JSON responses use camelCase (not snake_case):

- `currentIndex` (not `current_index`)
- `verticalMirror` (not `vertical_mirror`)
- `horizontalMirror` (not `horizontal_mirror`)
- `timerFlowMode` (not `timer_flow_mode`)
- `showFolderHistoryPanel` (not `show_folder_history_panel`)
- `showTopControls` (not `show_top_controls`)
- `showImageHistoryPanel` (not `show_image_history_panel`)
- `showBottomControls` (not `show_bottom_controls`)
- `isFullscreenImage` (not `is_fullscreen_image`)

## Debugging Tips

### Verifying Bridge Works

```bash
# Start bridge
cargo run --bin test-bridge

# In another terminal, test health
curl http://127.0.0.1:3000/health

# Test simple endpoint
curl http://127.0.0.1:3000/api/folder_history
```

### Checking State Persistence

```rust
// In img_loader.rs, add logging
println!("After set_current_folder_by_path: {:?}", self.get_current_folder_id_and_path()?);
```

### Database Inspection

```bash
# Check DB location
echo $RANDOM_PICS_DATA_DIR
ls -la /tmp/random-pics-test/

# Inspect state table
sqlite3 /tmp/random-pics-test/imgstate.sqlite "SELECT * FROM state"
```

## Next Steps

1. Fix folder selection state regression (blocks parity testing)
2. Complete Rust HTTP bridge implementation
3. Run full parity test suite
4. Verify CI pipeline integration
5. Proceed to Phase 4 once sustained green parity

See `SECURITY.md` for full migration plan phases.
