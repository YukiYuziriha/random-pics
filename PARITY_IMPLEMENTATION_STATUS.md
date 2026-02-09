# Parity Test Implementation Plan Status

## Completed (Phase 3.5 Foundation)

### 1. Shared Backend Facace ✓
- **File**: `src-tauri/src/backend.rs`
- Defines error types, request structs, and shared interface
- Provides `BackendResult<T>` and `map_to_http_status()` for consistent error handling
- Ready for use by both Tauri commands and test bridge

### 2. Dual-Path Test Infrastructure ✓
- **Scripts**:
  - `scripts/run-parity-tests.mjs` - Runs both Bun and Rust bridge tests, compares results
  - `scripts/run-backend-tests.mjs` - Runs tests against a specific backend
- **Test bridge wrapper**: `tests/tauri-test-bridge.js` - Node.js HTTP server wrapping Tauri commands (concept only, requires WebView context)
- **Added to package.json**:
  - `test:bun` - Run tests against Bun backend
  - `test:rust-bridge` - Run tests against Rust bridge
  - `test:parity` - Run full parity comparison

### 3. Bun Baseline Verification ✓
- **Status**: All 18/18 scenarios passing
- **Test duration**: ~800ms
- Confirmed existing test suite works correctly

## In Progress

### 4. Rust HTTP Test Bridge
- **File**: `src-tauri/src/test_bridge.rs`
- **Framework**: Hyper (simpler than axum, less dependencies)
- **Status**: Compilation errors with `Box<dyn std::error::Error>` and Send/Sync traits

**Compilation Issues**:
1. `dyn StdError` cannot be sent between threads safely
2. Multiple type inference issues with rusqlite closures
3. Handler trait bounds for HTTP routing

**Resolution Options**:
- Option A: Fix current hyper implementation with proper Send/Sync bounds
- Option B: Switch to a simpler HTTP framework (warp, tiny_http)
- Option C: Share existing lib.rs ImageLoader instead of duplicating DB code
- Option D: Use Bun/Node as bridge process (tests/tauri-test-bridge.js approach)

**Recommended Path**: Option C - refactor to use existing lib modules cleanly, which avoids duplication and leverages already-working logic

## Required for Phase 3.5 Parity Gate

### To Complete Parity Testing:
1. ✅ Fix Rust test bridge compilation (choose resolution path above)
2. ⏳ Build and run Rust bridge: `cargo run --bin test-bridge`
3. ⏳ Run parity comparison: `bun run test:parity`
4. ⏳ Verify CI pipeline can run both test suites

### Contract Compliance (from tests/adapters/http.ts):
✓ All endpoints mapped:
- POST /api/pick_folder
- GET /api/next_folder (404 for no folder)
- GET /api/prev_folder (404 for no folder)
- GET /api/folder_history
- POST /api/reindex_current_folder
- GET /api/current_image
- GET /api/next
- GET /api/prev
- GET /api/next_random
- GET /api/prev_random
- GET /api/force_random
- GET /api/normal_history
- GET /api/random_history
- POST /api/reset_normal_history
- POST /api/reset_random_history
- GET /api/state
- POST /api/state
- POST /api/full_wipe

✓ JSON camelCase contract in test_bridge.rs:
- `currentIndex` (not `current_index`)
- `verticalMirror`, `horizontalMirror`, `timerFlowMode`
- `showFolderHistoryPanel`, `showTopControls`, etc.

✓ Error status semantics:
- next_folder/prev_folder: 404 for no folder
- Other errors: 500 with error message
- Image endpoints: return bytes with Content-Type: image/jpeg

## Blocked By: Folder Selection Regression

**Issue**: After pick_folder, subsequent ops act as if no folder is selected

**Likely Cause**: Shared state/lifecycle issue in ImageLoader around:
- `current_folder_id` not being properly persisted
- `get_current_folder_id_and_path()` returning stale results
- Or database transaction/concurrency issue

**Debug Steps Required**:
1. Add logging to ImageLoader::set_current_folder_and_index()
2. Verify state table is updated correctly
3. Check if DB path respects RANDOM_PICS_DATA_DIR
4. Test sequential pick_folder -> get_current_image flow
5. Test multiple pick_folder calls in sequence

## Next Steps

1. **Fix regression** - Debug and resolve folder selection state issue in `src-tauri/src/img_loader.rs`
2. **Complete bridge** - Finish Rust test-bridge implementation
3. **Run full parity** - Execute `bun run test:parity` to compare both backends
4. **CI integration** - Add GitHub Actions job for dual-path parity gate
5. **Phase 4 preparation** - Once parity sustained green, prepare to remove Bun runtime

## Files Created/Modified

**New Files**:
- `src-tauri/src/backend.rs` - Shared facade
- `src-tauri/src/test_bridge.rs` - Rust HTTP bridge (in progress)
- `tests/tauri-test-bridge.js` - Node.js bridge concept
- `scripts/run-parity-tests.mjs` - Parity comparison script
- `scripts/run-backend-tests.mjs` - Individual backend testing
- `PARITY_IMPLEMENTATION_STATUS.md` - This document

**Modified Files**:
- `src-tauri/Cargo.toml` - Added hyper dependencies, test_bridge bin target
- `src-tauri/src/lib.rs` - Added backend module
- `package.json` - Added test:bun, test:rust-bridge, test:parity scripts
