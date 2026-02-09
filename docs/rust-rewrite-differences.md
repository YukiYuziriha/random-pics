# Rust Rewrite Differences vs Bun Server Branch

This document tracks behavior and implementation differences between:

- Bun server branch baseline (current `main`), and
- Rust + Tauri command path (rewrite branch).

It is focused on real logic/UI differences, not just file moves.

## Backend Logic Differences

1. Transport boundary changed from HTTP endpoints to Tauri `invoke` commands.
2. Runtime no longer depends on Bun request handlers for core app actions.
3. Rust indexing now uses batch insert transaction with prepared statement reuse.
4. Rust image loading returns raw file bytes directly, instead of decode + JPEG re-encode.
5. Rust parity fixes applied for data semantics:
   - FK-safe delete order in `full_wipe` transaction.
   - `lap_has` no-row handling via optional query result.

## UI/Interaction Differences

1. Indexing state is now explicit in UI:
   - folder appears immediately in history with `loading...` state,
   - bottom-left indexing log panel shows live progress lines.
2. While indexing is active, image controls are disabled to prevent overlapping actions.
3. Timer is stopped during indexing to avoid compounded UI/backend signals.
4. Folder and destructive controls are guarded during indexing for consistent state.

## Notes on Compatibility

1. Behavior parity suite remains the acceptance gate for traversal/history/state semantics.
2. Performance changes are intended to preserve functional outcomes while reducing latency.
3. Bun branch remains the baseline reference for migration comparison during rewrite.

## Security Hardening Differences

1. Tauri now uses explicit CSP rules instead of `csp: null`.
2. Capabilities were narrowed from `core:default` to required event + dialog permissions.
3. Folder selection now canonicalizes and validates path readability before indexing.
4. Command errors are sanitized through centralized mapping to avoid leaking internal details.
