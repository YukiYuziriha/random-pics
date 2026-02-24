# Testing and Regression Suite

This project now includes a Rust backend regression suite to protect core behavior while folder-tree and checked-scope work is implemented.

## Run Commands

- `bun run test` - run Rust backend unit/regression tests.
- `bun run test:list` - list available Rust tests.
- `bun run test:ci` - run Rust tests plus `bun tsc`.

## Current Coverage

1. Command-level argument and error sanitization behavior.
2. DB schema initialization and additive migration behavior:
   - state column backfill,
   - old global unique image-path migration to folder-scoped uniqueness.
3. Random/history backend invariants:
   - all-hidden random error path,
   - random history reset keeps hidden-random blacklist,
   - hiding random history image keeps pointer valid,
   - folder deletion clears dependent table rows transactionally.

## Why This Exists

The upcoming folder-tree checked-scope work changes data flow and selection logic. This suite provides a baseline so we can detect regressions immediately while keeping image-loading behavior stable.
