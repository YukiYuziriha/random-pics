# Tauri Packaging Lessons (Do Not Repeat)

This project moved from Neutralino to Tauri and hit multiple packaging/runtime traps.
Use this as a guardrail for future changes.

## Core architecture now

- Frontend: React bundle in `dist/main.js`
- Backend: Bun server compiled to standalone binary `dist-tauri/server`
- Desktop shell: Tauri (`src-tauri`)
- Runtime model in packaged app:
  - Tauri launches backend binary from setup hook
  - Window points to `http://127.0.0.1:3000`
  - Frontend calls backend `/api/*`

## Why this was hard

1. Dev and packaged app are different worlds.
   - `tauri dev` can work while `.deb` fails due to missing packaged assets or runtime binaries.

2. Tauri security/capabilities are strict on remote URLs.
   - Dialog plugin on `http://127.0.0.1:3000` needs explicit remote capability URL scope.

3. Watch commands break build pipelines.
   - `beforeBuildCommand` must be one-shot, never `--watch`.

4. Packaged filesystem layout differs from source repo.
   - Debian bundle resources land under `_up_`; code must resolve both layouts.

5. “Standalone” means no runtime Bun requirement.
   - Shipping `server.ts` and running `bun server.ts` is not standalone.
   - Must compile backend binary and bundle it.

## Mandatory invariants

Keep these true at all times:

- `src-tauri/tauri.conf.json`
  - `build.frontendDist` is isolated (`../dist-tauri`), not project root.
  - `build.beforeBuildCommand` is `bun run build:tauri` (non-watch).
  - `app.windows[0].url` is `http://127.0.0.1:3000`.
  - `bundle.resources` includes:
    - `../index.html`
    - `../dist`
    - `../dist-tauri/server`

- `src-tauri/capabilities/default.json`
  - includes remote URL scope for localhost backend:
    - `http://127.0.0.1:3000/*`
    - `http://localhost:3000/*`
  - includes `dialog:allow-open`

- `src-tauri/src/lib.rs`
  - release mode starts bundled backend binary
  - checks both resource paths (`dist-tauri/server` and `_up_/dist-tauri/server`)
  - sets `RANDOM_PICS_DATA_DIR` for writable DB location
  - waits for backend port before continuing

- `src/db.ts`
  - uses `RANDOM_PICS_DATA_DIR` when provided
  - only falls back to repo-relative path in dev

## Failure signatures and root causes

- `asset not found: index.html`
  - `frontendDist` missing `index.html` or wrong folder

- Build hangs forever
  - watch mode used in `beforeBuildCommand`

- App crashes on startup with setup hook `No such file or directory`
  - bundled backend binary path mismatch in packaged layout

- Folder picker button does nothing in packaged app
  - missing remote capability URL scope or missing dialog permission

- Packaged app runs only where Bun is installed
  - backend launched via `bun server.ts` instead of bundled binary

## Safe change workflow

### Frontend-only changes (`src/**/*.tsx`, styles, UI)

1. `bun tsc`
2. `source "$HOME/.cargo/env" && bunx tauri build --bundles deb`
3. reinstall `.deb`

No Rust rewrite needed.

### Backend logic changes (`server.ts`, `src/imgLoader.ts`, `src/db.ts`)

1. edit JS/TS backend code
2. `bun tsc`
3. rebuild `.deb` with same command

`build:tauri` recompiles backend binary automatically.
No Rust rewrite needed unless startup/native behavior changes.

### Tauri/native changes (`src-tauri/**`)

1. update config/capabilities/Rust
2. rebuild `.deb`
3. test installed app behavior (not only `tauri dev`)

## Minimal verification checklist before saying “works”

- `.deb` builds successfully
- package contains `usr/bin/random-pics`
- package contains bundled backend binary under `_up_/dist-tauri/server`
- installed app launches
- folder picker opens and selecting folder updates app
- image load endpoints work (`next`, `prev`, random)

## Commands used most often

```bash
bun tsc
source "$HOME/.cargo/env" && bunx tauri build --bundles deb
sudo dpkg -i src-tauri/target/release/bundle/deb/random-pics_0.1.0_amd64.deb
random-pics
```
