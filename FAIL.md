# Build Failures

- `bunx tauri init` failed in non-interactive shell (`failed to prompt input: not a terminal`).
- `bunx tauri init --dist-dir ...` failed due wrong flag (`--dist-dir` unsupported; use `--frontend-dist`).
- Packaging hung because Tauri `beforeBuildCommand` incorrectly used watch mode (`bun run build:watch`).
- Installed `.deb` failed at runtime: `asset not found: index.html` because `frontendDist` pointed to `../dist` without an `index.html`.
- `bun tsc` failed after setting `frontendDist` to project root because TypeScript started checking generated `src-tauri/target/**` files.
- `bunx tauri build --bundles deb` failed because `frontendDist` was project root and included forbidden folders (`src-tauri/target`, `node_modules`, `src-tauri`).
