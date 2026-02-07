## random-pics
Image player / randomizer / timed slideshow for gesture drawing.

## what it does
- indexes large folder trees of images
- supports normal and random traversal modes
- keeps normal history, random history, and folder history
- has timer-based image switching
- persists mirror/greyscale state

## dev run
Requirements:
- Bun
- Rust toolchain (for Tauri)

Command:
```bash
source "$HOME/.cargo/env" && bunx tauri dev
```

What this does:
- starts frontend watch build
- starts backend server on `127.0.0.1:3000`
- runs Tauri desktop app

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

If you change `server.ts`:
- same command; `build:tauri` compiles `server.ts` into bundled binary automatically
- no manual Rust rewrite needed

You only need Rust code changes when modifying:
- `src-tauri/src/*.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/*.json`
