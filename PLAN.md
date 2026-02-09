# random-pics Architecture + Test/CI Plan

## 1) Current Structure Review (Meta Level)

### Runtime layers

1. **Desktop shell (Tauri / Rust)**
   - Role: application container, startup orchestration, packaged runtime entrypoint.
   - In packaged mode it launches the bundled backend binary, passes runtime data directory, and waits for backend readiness before UI use.
   - Key files: `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`.

2. **Backend service (Bun HTTP server)**
   - Role: single source of truth for image traversal, folder indexing, history management, and persisted app/image state.
   - Exposes local HTTP API (`/api/*`) and serves image bytes/static assets to the frontend.
   - Key files: `server.ts`, `src/imgLoader.ts`, `src/db.ts`.

3. **Frontend app (React)**
   - Role: UI composition, user interactions, local view state, timers, and calls to backend API.
   - Uses endpoint constants for client/server contract consistency.
   - Key files: `src/App.tsx`, `src/components/*`, `src/constants/endpoints.ts`.

### Logical layers and responsibilities

1. **Presentation layer**
   - UI components for controls and history panels.
   - Handles rendering, input events, and local interaction state.

2. **Application flow layer (frontend orchestration)**
   - Startup hydration flow: folder history, persisted state, current image/history restore.
   - Timer behavior and image navigation triggers.

3. **API contract layer**
   - Centralized endpoint definitions consumed by both frontend and backend.
   - Reduces contract drift risk.

4. **Domain layer (backend image/session logic)**
   - Folder scan/index lifecycle.
   - Traversal modes (normal/random), history pointer movement, reset/reindex/wipe actions.

5. **Persistence layer**
   - SQLite storage for durable state/history metadata.
   - Runtime-aware DB location (packaged writable directory vs local dev path).

### Data flow (high level)

1. User action in React -> HTTP request to localhost API.
2. API route delegates to domain logic (`imgLoader`) and persistence (`db`).
3. Backend returns JSON/image payload.
4. Frontend updates view state and rendering.

### Cross-cutting concerns

1. **Packaging-specific behavior**
   - Dev and packaged app are materially different paths; packaged mode requires bundled backend binary resolution.

2. **Security/capabilities boundary**
   - Tauri remote URL capability scope and dialog permission are required for local API + folder picker behavior.

3. **State split**
   - Durable app/image state in SQLite.
   - Timer values in browser localStorage.

4. **Build coupling**
   - `build:tauri` compiles frontend and backend artifacts expected by Tauri bundle configuration.

### Current quality pipeline status

1. Validation today is primarily TypeScript typecheck (`bun tsc`).
2. No dedicated test runner/configured unit/integration/E2E suites.
3. No CI workflow in repository to enforce checks on pull requests.

---

## 2) Detailed Test Suite Implementation Plan

## Goals

1. Detect regressions in traversal/history/state persistence behavior early.
2. Verify API contract stability between frontend and backend.
3. Protect packaged-runtime assumptions that previously broke releases.
4. Keep fast feedback loop for local development.

## Test architecture (target)

### A. Unit tests (fast, deterministic)

**Scope**
- Pure domain logic in image traversal/history operations.
- DB helper behavior that does not require full app startup.
- Small frontend utility logic (if extracted).

**Primary focus areas**
1. Normal mode pointer movement and boundaries.
2. Random mode selection constraints and lap behavior.
3. History append/truncate semantics after branch-like navigation.
4. State serialization/deserialization and defaults.

### B. Integration tests (API + storage)

**Scope**
- Bun server routes with temporary database and fixture image tree.
- End-to-end request/response behavior at HTTP boundary (without Tauri shell).

**Primary focus areas**
1. `pick-folder` updates active folder and folder history.
2. `next`/`prev`/`random` maintain expected history transitions.
3. `reindex` and `reset` behavior consistency.
4. Wipe/reset endpoints and resulting persisted state.
5. Image-serving endpoint status/content-type/error handling.

### C. UI component tests (contract-level, not pixel-level)

**Scope**
- Critical interaction paths in `App` and key control components.
- Mock API responses to assert UI transitions.

**Primary focus areas**
1. Startup hydration path (with and without prior state).
2. Control actions trigger correct backend calls.
3. Fullscreen/panel visibility toggles and persistence interactions.
4. Timer mode transitions and stop/start behavior.

### D. E2E smoke tests (minimal but high-value)

**Scope**
- Launch app stack in CI-friendly mode (backend + frontend).
- Validate one full happy path and one failure-path scenario.

**Primary focus areas**
1. Select folder -> load image -> next/prev -> history visible.
2. Restart scenario restores last image/state.
3. Bad-folder/empty-folder handling surfaces stable UX behavior.

---

## 3) Test Data Strategy

1. Add deterministic fixture directories under `tests/fixtures/images/`:
   - nested folders,
   - mixed image formats,
   - non-image files,
   - edge cases (single file, empty folder).
2. Add DB fixtures/seeds and per-test isolated temp DB creation.
3. Ban shared mutable fixtures; each test receives isolated workspace.
4. Standardize cleanup hooks so tests do not leak state across runs.

---

## 4) Implementation Phases

### Phase 0 - Test foundation

1. Choose and configure test tooling for:
   - TypeScript unit/integration,
   - React component testing,
   - E2E smoke automation.
2. Define repository layout:
   - `tests/unit/`
   - `tests/integration/`
   - `tests/ui/`
   - `tests/e2e/`
   - `tests/fixtures/`
3. Add shared helpers for temp directories, fixture loading, and DB bootstrap.
4. Add standard scripts in `package.json`:
   - `test:unit`
   - `test:integration`
   - `test:ui`
   - `test:e2e`
   - `test` (aggregator)

### Phase 1 - Domain safety net

1. Cover traversal/history core rules first (highest regression risk).
2. Add explicit tests for edge transitions at boundaries.
3. Add deterministic random-mode tests by seed/stub approach.

### Phase 2 - API integration coverage

1. Validate all `/api/*` routes with success + failure cases.
2. Assert persistence side effects after mutating endpoints.
3. Add contract tests for response shape stability.

### Phase 3 - UI critical paths

1. Add component-level tests for controls and hydration behavior.
2. Assert user-observable state transitions, not implementation internals.
3. Cover timer flow interactions and panel visibility persistence.

### Phase 4 - E2E smoke + release guardrails

1. Add small E2E suite for top user journey.
2. Add packaged-runtime smoke check (resource presence + backend launch assumptions).
3. Keep E2E small to prevent CI bottlenecks.

### Phase 5 - Hardening

1. Add flake tracking and retries only for known unstable external factors.
2. Add optional coverage reporting and thresholds for core backend domain files.
3. Tune test runtime budget and parallelization.

---

## 5) CI Plan

## Trigger model

1. Pull requests: run fast checks + unit/integration/ui tests.
2. Main branch pushes: run full suite including E2E smoke.
3. Release tags: run full suite plus packaging verification jobs.

## Workflow structure (recommended)

### Workflow 1: `ci-fast`

**Runs on PR**
1. Install dependencies.
2. Typecheck (`bun tsc`).
3. Lint (if added).
4. Unit tests.
5. Integration tests.
6. Upload test artifacts (reports/logs) on failure.

### Workflow 2: `ci-ui-e2e`

**Runs on PR (selective) and on main**
1. Build frontend/backend.
2. Run UI component tests.
3. Run E2E smoke suite.
4. Upload screenshots/traces/logs on failure.

### Workflow 3: `ci-release-guard`

**Runs on main or tag**
1. Build Tauri bundle in CI environment.
2. Validate expected packaged artifacts exist.
3. Run minimal post-build runtime sanity checks.
4. Publish artifacts for manual download/verification.

## CI quality gates

1. Require passing `ci-fast` for merge.
2. Require passing `ci-ui-e2e` for merge once stable.
3. Block release job if any required check fails.
4. Enforce branch protection using these checks.

## CI reliability controls

1. Cache dependencies and build outputs where safe.
2. Use deterministic fixture generation and test isolation.
3. Keep flaky tests quarantined with explicit issue tracking.
4. Add timeout budgets per suite to avoid hanging jobs.

---

## 6) Documentation Plan for `docs/`

Current docs include packaging lessons, but test/CI and operating guidance are not yet documented as first-class references.

### Add these documents

1. `docs/testing-strategy.md`
   - test pyramid for this project,
   - scope by test type,
   - fixture strategy,
   - local run commands,
   - policy for flaky tests.

2. `docs/ci-pipeline.md`
   - workflow inventory,
   - triggers/required checks,
   - artifact handling,
   - failure triage flow.

3. `docs/api-contract.md`
   - endpoint catalog,
   - request/response contracts,
   - error model expectations,
   - compatibility guarantees.

4. `docs/state-model.md`
   - persisted state ownership (DB vs localStorage),
   - lifecycle and restore rules,
   - migration expectations for schema changes.

5. `docs/qa-checklist.md`
   - pre-release smoke checklist,
   - packaged app validation checklist,
   - regression checklist tied to previous failures.

### Update existing docs

1. `README.md`
   - replace "typecheck/test" section with explicit test matrix and commands.
2. `docs/tauri-packaging-lessons.md`
   - add references to new CI release-guard checks.
3. `FAIL.md`
   - standardize as incident log with date, signature, root cause, remediation.

---

## 7) Security Review (Local-Only Standalone App)

## Security intent

1. App is intended to be local-only, desktop-only, and filesystem-focused.
2. Threat model should prioritize local process abuse, accidental network exposure, and unsafe file-path handling.

## Current concerns identified

1. **Backend bind scope risk**
   - `server.ts` starts `Bun.serve` without explicit `hostname`.
   - Bun docs indicate default bind is `0.0.0.0` (all interfaces), which can violate local-only intent if host firewall is permissive.

2. **CSP hardening disabled**
   - `src-tauri/tauri.conf.json` sets `app.security.csp` to `null`.
   - With URL loading model (`http://127.0.0.1:3000`), this reduces desktop-shell CSP guardrails and increases impact of any injected script/content.

3. **No request-origin constraints on local API**
   - `server.ts` accepts API calls without origin/token checks.
   - If backend becomes reachable beyond loopback, mutating routes (`pick-folder`, `full-wipe`, state writes) can be abused.

4. **Input validation gap on filesystem path operations**
   - Folder path from POST body is accepted as provided and fed to indexing logic.
   - For local apps this is expected functionality, but input guards and error normalization are still needed to reduce crash/abuse surface.

5. **Operational/log hygiene gaps**
   - No documented security checklist, no CI security gate, and no baseline static audit in pipeline.

## Security controls plan (implementation)

### A. Runtime/network hardening (highest priority)

1. Explicitly bind backend to loopback only (`127.0.0.1`) in all modes.
2. Add startup assertion/fail-fast if resolved bind is not loopback.
3. Add CI check that fails if backend host binding deviates from loopback.

### B. Desktop web-surface hardening

1. Replace `csp: null` with explicit CSP policy aligned to app asset needs.
2. Keep remote capability scope strictly localhost and minimal plugin permissions.
3. Add regression check for Tauri capabilities/config drift.

### C. API abuse resistance for local context

1. Enforce method and content-type validation on mutating endpoints.
2. Add request-size limits for JSON payloads.
3. Add optional local anti-CSRF/nonce header between app UI and backend to block opportunistic local web-page abuse.

### D. Filesystem safety controls

1. Canonicalize and validate selected folder paths before indexing.
2. Gracefully reject invalid/unreadable paths with consistent error model.
3. Ensure symlink/permission edge cases are handled predictably.

### E. Dependency and build-chain controls

1. Add dependency audit checks in CI.
2. Pin toolchain/runtime versions used by CI for reproducible builds.
3. Preserve standalone packaging invariant (no runtime Bun requirement on target machine).

## Security-focused test plan additions

1. Integration tests asserting loopback-only bind behavior.
2. API negative tests for malformed JSON, wrong methods, oversized payloads, and invalid folder paths.
3. Packaging tests asserting expected Tauri capability scope and CSP presence.
4. Regression tests for destructive endpoints to confirm explicit invocation semantics.

## Security documentation additions (`docs/`)

1. `docs/security-model.md`
   - local-only threat model,
   - trust boundaries,
   - network exposure assumptions,
   - accepted residual risks.

2. `docs/security-checklist.md`
   - pre-release security checks,
   - packaging/config verification,
   - incident response entry format.

3. Extend `docs/api-contract.md`
   - input validation rules,
   - error codes,
   - mutating endpoint constraints.

4. Extend `docs/ci-pipeline.md`
   - security job inventory,
   - required pass/fail gates,
   - dependency audit policy.

---

## 8) Acceptance Criteria for This Plan

1. Repository has runnable unit + integration + UI + E2E smoke suites.
2. CI enforces required checks on PRs and main.
3. Packaging regressions addressed by automated release-guard workflow.
4. `docs/` contains testing, CI, API contract, and state-model references.
5. New contributors can run and interpret all checks without tribal knowledge.
