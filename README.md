## random-pics
Image player / randomizer / timed slideshow for gesture drawing.

## what it does
- indexes large folder trees of images
- supports normal and random traversal modes
- keeps normal history, random history, and folder history
- has timer-based image switching with selectable timer flow mode (`random | normal`)
- starts timer mode by serving a new image immediately, then begins countdown loop
- restores the last shown image on app startup
- supports image transforms (vertical mirror, horizontal mirror, greyscale)
- supports fullscreen image mode (black background, image-only view)
- supports UI visibility toggles for both history panels and both button groups
- persists image + UI state in sqlite `state` table (transforms, timer mode, panel visibility, fullscreen, last image)

## dev run
Requirements:
- Bun
- Rust toolchain (for Tauri)

Command (safe on fresh shells):
```bash
source "$HOME/.cargo/env" && bunx tauri dev
```

If Rust is already on PATH:
```bash
bunx tauri dev
```

What this does:
- starts frontend watch build
- runs Tauri desktop app with bundled local frontend assets
- uses Rust Tauri commands (`invoke`) for backend logic
- does not require localhost HTTP API

## typecheck / test
This project currently uses TypeScript typecheck as the main validation step:
```bash
bun tsc
```

## build standalone .deb
```bash
source "$HOME/.cargo/env" && bunx tauri build --bundles deb
```

Output package:
`src-tauri/target/release/bundle/deb/random-pics_0.1.0_amd64.deb`

Install:
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/random-pics_0.1.0_amd64.deb
```

Run installed app:
```bash
random-pics
```

## change workflow (important)
If you change `src/App.tsx` (or any frontend file):
- just rebuild package (`bunx tauri build --bundles deb`) and reinstall `.deb`

If you change backend behavior, update Rust code in:
- `src-tauri/src/*.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/*.json`

Current runtime architecture:
- no Bun backend process in app runtime
- no localhost `127.0.0.1:3000` dependency
- no `/api/*` HTTP transport in frontend app flow

## package size note
If `.deb` size looks unexpectedly large, check for stale build artifacts in `dist-tauri`.

This app bundles `../dist-tauri` as Tauri resources. If `dist-tauri/server` exists from older builds, it will be included in the package even though runtime no longer uses it.
