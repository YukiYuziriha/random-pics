# Security Migration Plan: True Local Desktop App

## Purpose

Move from current Tauri + Bun localhost server architecture to a true local desktop architecture:

- no Bun runtime
- no localhost HTTP API
- all backend logic in Rust inside Tauri process
- same user behavior preserved (folder selection, indexing, random/normal traversal, timer flow, history, persisted state)

This plan prioritizes practical security for a standalone filesystem slideshow app.

---

## Security Outcome Target

### Must be true after migration

1. No network service is required for app operation.
2. UI communicates with backend via Tauri commands only (`invoke`), not HTTP.
3. Frontend is loaded from bundled local assets, not remote URL.
4. Filesystem access is constrained to explicit user-selected paths.
5. State persistence behavior remains consistent with current app expectations.

### Non-goals

1. Absolute security against a compromised host OS.
2. Enterprise multi-user sandboxing.

---

## Current Risk Drivers (to remove)

1. Local HTTP backend boundary (`127.0.0.1:3000`) is an avoidable attack surface.
2. Backend exposure risk if bind config drifts from loopback.
3. Tauri remote URL loading model increases web-surface complexity.
4. CSP currently disabled in config (`csp: null`).

---

## Target Architecture

### Layer model

1. **React UI layer**
   - Responsible for rendering and user interactions.
   - Uses Tauri `invoke` for all backend operations.

2. **Tauri command layer (Rust)**
   - Thin command handlers for each user action/state request.
   - Validates inputs and maps errors into stable UI-consumable responses.

3. **Domain service layer (Rust)**
   - Folder indexing, traversal algorithms, random/normal history handling, pointer movement, reset/wipe logic.

4. **Persistence layer (Rust + SQLite)**
   - Owns schema/migrations, durable state, folder/image/history data.

### No network boundary

- Remove all `/api/*` dependencies and HTTP transport assumptions.
- All calls become in-process command invocations.

---

## Behavior Preservation Matrix

The rewrite must preserve existing behavior exactly in these areas:

1. Folder pick + folder history navigation.
2. Indexing/reindexing semantics.
3. Normal mode history + pointer behavior.
4. Random mode history + lap behavior.
5. Current image restore on startup.
6. Image state persistence (mirror, greyscale, timer mode, panel visibility, fullscreen, last image).
7. Full wipe/reset endpoint-equivalent behaviors.

### Test-first principle (mandatory)

Before rewriting backend/runtime, lock behavior with tests on the current Bun implementation.

1. Build baseline tests against current HTTP endpoints first.
2. Treat those tests as product behavior contract, not transport contract.
3. Port test adapters from HTTP to Tauri `invoke` without changing expected outcomes.
4. Only remove Bun path after parity suite passes against Rust implementation.

---

## Migration Plan

## Phase 0 - Baseline lock ✓ COMPLETE

1. Define current behavior contract in docs (state transitions and expected responses). ✓
2. Freeze endpoint-to-action mapping as migration checklist. ✓
3. Add parity acceptance list for each feature before deleting Bun server path. ✓
4. Implement baseline test suites on current implementation:
   - domain behavior tests (12 scenarios), ✓
   - API integration behavior tests (6 scenarios), ✓
   - UI flow tests for critical paths. (deferred - covered by domain/api tests)

Deliverable:
- Written behavior contract plus executable baseline tests used as parity source. ✓
  - See `tests/IMPLEMENTATION.md` and `tests/README.md`

## Phase 0.5 - Shared scenario harness ✓ COMPLETE

1. Introduce transport-agnostic test scenarios (Given/When/Then style). ✓
2. Add two adapters:
   - HTTP adapter (current Bun routes), ✓
   - Command adapter (future Tauri invoke calls). (implementation stub - ready for Phase 2)
3. Ensure assertions check outcomes/state transitions, not endpoint internals. ✓

Deliverable:
- One scenario suite runnable against both old and new backends. ✓
  - 18 scenarios total (12 domain + 6 API)
  - All passing against Bun HTTP backend
  - See `tests/` directory for implementation

## Phase 1 - Rust backend core extraction ✓ COMPLETE

1. Create Rust modules for:
   - DB access + migrations, ✓
   - folder/image indexing, ✓
   - traversal/history engine, ✓
   - persisted UI/image state. ✓
2. Reproduce current data model and migration safety guarantees. ✓
3. Preserve data directory semantics for packaged mode. ✓

Deliverable:
- Rust domain/persistence modules with behavior parity tests. ✓
  - src-tauri/src/db.rs - Database schema and migrations
  - src-tauri/src/img_loader.rs - Domain logic ported from TypeScript

## Phase 2 - Command API design (replace HTTP contract) ✓ COMPLETE

1. Define explicit Tauri commands equivalent to current user actions:
   - next/prev/random/current image, ✓
   - random/normal history, ✓
   - next/prev/pick folder, ✓
   - reindex/reset/wipe, ✓
   - get/set app state. ✓
2. Standardize command result envelopes for success and error cases. ✓
3. Add strict input validation/canonicalization for filesystem paths. ✓

Deliverable:
- Stable command interface documented in `docs/api-contract.md`. ✓
  - src-tauri/src/commands.rs - Tauri command handlers
  - src/apiClient.ts - Frontend API client
  - tests/adapters/tauri.ts - Tauri test adapter

## Phase 3 - Frontend transport swap ✓ COMPLETE

1. Replace all `fetch` calls with `invoke` calls. ✓
2. Introduce a frontend command client layer so UI components do not depend on transport details. ✓
3. Preserve UI behavior and state flow. ✓

Deliverable:
- Frontend no longer references localhost API or `/api/*`. ✓
  - src/App.tsx - All fetch calls replaced with invoke
  - src/apiClient.ts - Unified invoke-based API client

## Phase 3.5 - Dual-path parity gate ✓ COMPLETE

1. Run full behavior suite against both implementations in CI:
   - Bun HTTP (legacy),
   - Rust commands (new).
2. Require equal pass/fail status and equivalent assertions for promoted scenarios.
3. Track intentional behavior changes explicitly in migration notes; otherwise parity is mandatory.

Deliverable:
- CI-enforced proof that Rust path preserves existing behavior. ✓
  - `bun run test:rust-bridge` passing: 18/18 scenarios
  - Rust test bridge parity blockers resolved (`full_wipe` FK order + random lap no-row handling)

## Phase 4 - Packaging/runtime switch

1. Remove Bun backend spawn logic from `src-tauri/src/lib.rs`.
2. Remove server build artifact requirements from build pipeline.
3. Switch Tauri app window to bundled local frontend assets.
4. Remove remote URL capability needs that only existed for localhost API.

Deliverable:
- Packaged app runs with no Bun binary and no server process.

## Phase 5 - Hardening pass

1. Replace `csp: null` with explicit CSP policy compatible with app assets.
2. Restrict Tauri permissions/capabilities to minimum required set.
3. Add centralized Rust error handling to prevent panic-driven crashes on malformed inputs.
4. Enforce path canonicalization and explicit rejection of invalid/unreadable paths.

Deliverable:
- Security controls documented and enforced in runtime config.

## Phase 6 - Decommission legacy path

1. Remove `server.ts` runtime path from app startup.
2. Remove obsolete endpoint constants and HTTP assumptions.
3. Keep migration notes for rollback window, then fully retire Bun server flow.

Deliverable:
- Single architecture path (Tauri + Rust commands only).

---

## Data and Migration Safety

1. Keep SQLite schema backward compatible across transition.
2. Use additive, versioned migrations (no destructive drops in normal upgrades).
3. Preserve existing user data location and auto-upgrade behavior.
4. Validate that startup after upgrade restores last known state correctly.

---

## Security Controls Checklist (Target State)

1. No listening TCP server required by app.
2. No remote URL loading for core app UI.
3. Explicit CSP enabled.
4. Minimal plugin permissions only.
5. Canonicalized filesystem paths with deny-on-error behavior.
6. Structured error responses (no internal path leakage beyond necessary UX messages).
7. Release builds reproducible and dependency-audited.

---

## Test and Verification Plan

## A. Parity tests

1. Compare old vs new behavior for traversal/history/state flows.
2. Assert startup restore behavior for existing DBs.
3. Assert reindex/reset/wipe parity semantics.
4. Keep canonical scenario list stable across migration:
   - select folder and index,
   - next/prev history boundaries,
   - random traversal + lap behavior,
   - state save/load,
   - restart restore,
   - destructive action semantics.
5. Run scenario suite against both adapters until Bun path is removed.

## B. Security tests

1. Confirm no open localhost/LAN port is required after launch.
2. Validate path validation rejects malformed/unreadable inputs.
3. Validate command handlers reject invalid payload shapes.
4. Validate app still works fully offline and local-only.

## C. Packaging checks

1. App starts without Bun installed.
2. No bundled server binary dependency remains.
3. Installed package passes functional smoke checks.

---

## CI Plan for Security Migration

1. Add required CI job for baseline behavior tests on Bun path (until retirement).
2. Add required CI job for Rust command-path behavior tests.
3. Add required CI job that compares parity scenario outcomes between both paths.
4. Add required CI job verifying no server artifact/HTTP path remains (post-cutover gate).
5. Add required CI job for dependency audit.
6. Add release job checks that inspect packaged output for expected local-only runtime shape.

### CI transition gates

1. **Gate A (pre-rewrite):** baseline tests must be green and stable on current app.
2. **Gate B (during rewrite):** dual-path parity suite must pass on every PR.
3. **Gate C (cutover):** Bun path removed only after sustained parity pass window.
4. **Gate D (post-cutover):** legacy Bun jobs removed; local-only runtime checks become mandatory.

---

## Documentation Updates Required

1. `docs/security-model.md`
   - local-only threat model,
   - trust boundaries,
   - residual risks.
2. `docs/api-contract.md`
   - command contract replacing HTTP endpoints.
3. `docs/ci-pipeline.md`
   - new required security/parity checks.
4. `docs/tauri-packaging-lessons.md`
   - update to reflect no-Bun/no-server architecture.

---

## Completion Criteria

Migration is complete when all are true:

1. Frontend uses only Tauri command invocations.
2. No localhost API calls exist in app code.
3. No Bun backend process is spawned in dev or packaged runtime.
4. Existing user DB upgrades cleanly with behavior parity.
5. Security and parity CI gates are mandatory and passing.
