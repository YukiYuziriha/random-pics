# Dual-Hand Shortcut System Plan

## First Priorities

- Normalize all button labels to kebab-case (`have-this-case`), never snake_case (`not_this_case`).
- Do not show bracketed shortcut hints on `start/stop` and `play/pause` controls.
- Persist shortcut hint visibility and shown side (`hide/view`, `left/right`) in DB across sessions.

## Objective

Implement a dual-hand shortcut system where:

- Every action has two always-active keys: one left-hand key and one right-hand key.
- The shortcut hint UI is toggled with `Ctrl` (toggle mode, not hold).
- The visible shortcut side (left vs right) is toggled with `Alt` (toggle mode, not hold).
- Only one side is shown on buttons at a time, but both sides always work.
- Shortcut data comes from a single source of truth with explicit `left` and `right` keys.

## Current Codebase Findings

### Keyboard handling

- Keyboard events are handled in `src/App.tsx` via one global `keydown` listener.
- Current key actions:
  - `F11` toggles OS fullscreen.
  - `f` toggles in-app fullscreen (`isFullscreenImage`).
- No current shortcut mapping object exists; controls are button-driven.

### Control rendering

- Action buttons are rendered with plain text labels via `src/components/ActionButton.tsx`.
- Image controls and folder controls are composed in:
  - `src/components/ImageControls.tsx`
  - `src/components/FolderControls.tsx`
- There is no existing shortcut hint layer or side-switching state.

### Persistence and state patterns

- UI state persistence already exists for image/view settings in `src/App.tsx` through `setImageState`.
- `localStorage` is already used for non-backend UI preferences (timer seconds, folder history mode).
- Shortcut visibility/side will be persisted in DB (not localStorage), aligned with other persistent UI state.

## Single Source of Truth Design

Create one centralized shortcut registry (frontend-only) that defines all actions and keys.

### Registry shape

Each shortcut entry should include:

- `actionId`: stable identifier used by keyboard dispatch and UI labels.
- `label`: base label text used on controls.
- `leftKey`: explicit left-hand key.
- `rightKey`: explicit right-hand key.
- `handler`: function reference already implemented in `App.tsx`.
- `isDisabled`: derived from existing states (for example indexing lock).

### Planned mappings (authoritative)

- vertical mirror: left `c`, right `,`
- horizontal mirror: left `v`, right `m`
- grayscale: left `b`, right `n`
- next normal: left `f`, right `k`
- prev normal: left `d`, right `j`
- next random: left `g`, right `l`
- prev random: left `s`, right `h`
- start/stop: left `t`, right `y`
- play/pause: left `r`, right `u`
- force new random: left `w`, right `o`
- toggle order (normal/random): left `q`, right `p`
- next folder: left `5`, right `7`
- prev folder: left `4`, right `6`
- reindex folder: left `3`, right `8`
- pick folder: left `2`, right `9`
- show/hide shortcut hints: `Ctrl` (toggle state)
- switch shown side: `Alt` (toggle `left`/`right`)

## State Model

Add shortcut UI state in `App.tsx`:

- `shortcutHintsVisible: boolean` (toggled by `Ctrl`)
- `shortcutHintSide: 'left' | 'right'` (toggled by `Alt`)

DB persistence (required):

- extend persisted image/UI state schema to include:
  - `shortcutHintsVisible`
  - `shortcutHintSide`
- load both values from DB during app initialization via existing image state load flow.
- write both values to DB whenever `Ctrl` or `Alt` toggles them.
- default on first launch:
  - `shortcutHintsVisible = false`
  - `shortcutHintSide = 'left'`

## Keyboard Event Logic Plan

Refactor keydown handling in `src/App.tsx` to route through the shortcut registry.

### Dispatch rules

- Normalize key input once per event.
- First handle toggle keys:
  - `Ctrl` flips visibility state.
  - `Alt` flips visible side.
- Then handle action keys:
  - Match against both `leftKey` and `rightKey` for every action.
  - Execute mapped handler regardless of currently shown side.
- Maintain existing `isIndexing` and folder availability protections by reusing existing handlers.

### Existing fullscreen key conflict

- `f` is currently used for fullscreen toggle, but requested mapping assigns `f` to next normal image.
- Plan: remove `f` as fullscreen key and keep fullscreen only on `F11` and the fullscreen button.

### Repeat-key behavior

- Prevent repeated toggles from key auto-repeat on `Ctrl`/`Alt` by ignoring repeat events for these toggle keys.
- Keep repeat behavior for navigation/action keys unchanged unless explicitly changed later.

## UI Rendering Plan

### Button label formatting

- When hints are hidden: show existing labels unchanged.
- When hints are visible:
  - show current side key only, prefixed in brackets.
  - format: `[c]vertical-mirror` for left side example.
  - when side switched: `[,]vertical-mirror` for right side example.
- Exception:
  - `start/stop` and `play/pause` controls show no `[]` key prefix even when hints are visible.

### Where hints appear

- Apply hint labels to all mapped actions in:
  - `FolderControls` buttons
  - `ImageControls` action buttons
  - timer start/stop and play/pause controls
  - flow mode toggle button (order toggle)
- Keep non-mapped utility buttons unchanged.

### Left/right table stability requirement

- Preserve button order as currently rendered.
- Treat first key in registry as left and second as right only (no inference).

## File-Level Implementation Plan

- `src/App.tsx`
  - introduce shortcut registry and centralized key dispatcher.
  - add toggle UI state for hints visibility and shown side.
  - pass computed shortcut labels/keys to child controls.
  - resolve `f` key conflict by removing fullscreen binding from `f`.
- `src/apiClient.ts`
  - extend `ImageState` type with shortcut hint visibility and side fields.
- `src-tauri/src/db.rs` and related persistence layer
  - add schema migration for new persisted shortcut UI fields.
  - ensure existing DB data is preserved during migration.
- `src-tauri/src/img_loader.rs` and command wiring
  - include new shortcut UI fields in get/set image state read/write paths.
- `src/components/ActionButton.tsx`
  - support displaying a computed shortcut prefix in label rendering.
- `src/components/FolderControls.tsx`
  - accept shortcut metadata/labels per button and render accordingly.
- `src/components/ImageControls.tsx`
  - accept shortcut metadata/labels for all mapped controls and render accordingly.
- `README.md` and/or `docs/*`
  - update shortcut behavior documentation to reflect dual-hand always-active model and Ctrl/Alt toggles.

## Validation Plan

### Functional checks

- Every mapped action responds to both left and right keys.
- Ctrl toggles hint visibility state each press.
- Alt toggles shown side each press.
- Hint text updates correctly to selected side while both key sets remain active.
- Start/stop, play/pause, order toggle, and folder actions respond via both mappings.
- No regression in indexing lock behavior and folder-required actions.
- Fullscreen still works via `F11` and UI button.

### Build/type checks

- Run `bun tsc` after implementation changes.

## Open Logic Question

Should shortcut actions still fire when keyboard focus is inside the timer numeric inputs?

- Current behavior blocks key shortcuts while typing in inputs.
- If this remains, "always active" will apply globally except active text inputs.
- If changed, shortcuts will trigger even during input editing.
