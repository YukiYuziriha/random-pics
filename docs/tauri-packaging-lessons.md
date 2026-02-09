# Tauri Runtime and Packaging Notes

This document reflects the post-cutover architecture where the app is local-only and does not run a Bun HTTP server.

## Current architecture

- Frontend: bundled static assets in `dist-tauri`.
- Backend: Rust command handlers inside Tauri process (`src-tauri/src/commands.rs`, `src-tauri/src/img_loader.rs`).
- Transport: Tauri `invoke` and event IPC only.
- Runtime model in packaged app:
  - no localhost service,
  - no bundled `server` binary,
  - no `/api/*` HTTP assumptions.

## Security controls enforced

- `src-tauri/tauri.conf.json`
  - `app.security.csp` is explicit (not `null`).
  - CSP allows only local assets and Tauri IPC channels.
- `src-tauri/capabilities/default.json`
  - permissions narrowed to:
    - `core:event:allow-listen`
    - `core:event:allow-unlisten`
    - `dialog:allow-open`
- `src-tauri/src/img_loader.rs`
  - folder input path is canonicalized before indexing.
  - invalid, non-directory, and unreadable paths are rejected.
- `src-tauri/src/commands.rs`
  - command errors are sanitized through a centralized path.
  - invalid `timerFlowMode` payloads are rejected.

## Build invariants

- `src-tauri/tauri.conf.json`
  - `build.frontendDist` points to `../dist-tauri`.
  - `build.beforeDevCommand` is `bun run build:watch:tauri`.
  - `build.beforeBuildCommand` is `bun run build:tauri`.
  - window config has no remote URL.
- `package.json`
  - `build:tauri` builds frontend bundle only (no server compilation).
- `src-tauri/src/lib.rs`
  - app setup initializes DB + loader only.
  - no backend spawn/wait logic.

## Failure signatures

- `asset not found` on launch
  - `dist-tauri` missing expected assets.
- folder picker opens but folder load fails with validation message
  - selected path is invalid, not a directory, or unreadable.
- command call fails with `internal error`
  - backend rejected an unsafe/internal failure without exposing raw internals.

## Development and build failure lessons learned

These issues were encountered during migration and resolved:

- `bunx tauri init` failed in non-interactive shell (`failed to prompt input: not a terminal`).
- `bunx tauri init --dist-dir ...` failed due wrong flag (`--dist-dir` unsupported; use `--frontend-dist`).
- Packaging hung because Tauri `beforeBuildCommand` incorrectly used watch mode (`bun run build:watch`).
- Installed `.deb` failed at runtime: `asset not found: index.html` because `frontendDist` pointed to `../dist` without an `index.html`.
- `bun tsc` failed after setting `frontendDist` to project root because TypeScript started checking generated `src-tauri/target/**` files.
- `bunx tauri build --bundles deb` failed because `frontendDist` was project root and included forbidden folders (`src-tauri/target`, `node_modules`, `src-tauri`).
- `bunx tauri build --bundles deb` failed after backend auto-start change because `tauri::Manager` trait import was missing for `app.path()`.
- Installed `.deb` could not pick folder because packaged app launched backend via `bun server.ts`, which is not available on standalone machines.

## Verification commands

```bash
bun tsc
source "$HOME/.cargo/env" && cargo check --manifest-path src-tauri/Cargo.toml
source "$HOME/.cargo/env" && bunx tauri build --bundles deb
```
