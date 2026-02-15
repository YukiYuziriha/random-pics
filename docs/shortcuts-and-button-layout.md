# Shortcuts and Button Layout Logic

This document explains how shortcut mapping and button ordering work in the app.

## Single Source of Truth

All shortcut metadata lives in `src/shortcuts.ts` in `SHORTCUT_REGISTRY`.

Each action defines:

- `id`: stable action key used by UI and keyboard handling
- `label`: canonical button label text
- `leftKey`: left-hand shortcut key
- `rightKey`: right-hand shortcut key
- `showHint`: whether shortcut hinting is enabled for the action

No component should hardcode shortcut labels or keys. Components render labels using helper functions from `src/shortcuts.ts`.

## Label Rendering Rules

`getShortcutLabel(actionId, side, hintsVisible)` applies these rules:

1. If action is missing, fallback to `actionId`.
2. If hints are hidden, return the plain action label.
3. If `showHint` is false, return the plain action label.
4. If the selected side has no key (empty string), return the plain action label.
5. Otherwise return bracketed key + label in form `[k]label`.

This prevents empty hint artifacts such as `[]reset-random-history`.

## Runtime Keyboard Behavior

- `Control` toggles shortcut hint visibility.
- `Alt` toggles which side is displayed (`left` or `right`).
- Both left and right keys remain active for key handling, independent of visible side.
- The app restores image order on startup from persisted timer flow mode (`random` or `normal`) and loads the current image from that order.
- Function keys are handled directly for panel toggles (`F2/F6`, `F3/F7`, `F4/F8`, `F5/F9`).
- Action key presses are resolved through `findActionByKey` against `SHORTCUT_REGISTRY`.
- Holding `z` (left layout) or `/` (right layout) enters timer value capture mode.
  - While in capture mode, all other shortcuts are blocked.
  - Numeric keys (`0-9`), `Backspace`, `Enter`, and `Space` are accepted for editing.
  - The start/stop timer control is visually highlighted while capture mode is active.
  - `Enter` or `Space` commits the typed value and exits capture mode.
  - Releasing the held modifier key (`z` or `/`) also commits the typed value and exits capture mode.
  - Committed value updates the initial timer duration (start/stop button value) only.
  - The remaining timer countdown is not affected by capture mode commits.

## Display Order Model

Display order is also centralized in `src/shortcuts.ts` via `SHORTCUT_DISPLAY_ORDER` and read through `getShortcutDisplayOrder(section, side)`.

Defined sections:

- `bottom-row-1`
- `bottom-row-2`
- `folder-controls`

This keeps layout order and key mapping synchronized in one module.

## Bottom Controls Ordering

Bottom controls are split into two containers representing keyboard rows.

### Left-side view

- Row 1 (`q/w/r/t` positions):
  - `[q]toggle-order`
  - `[w]new-random`
  - `[r]play` or `[r]pause`
  - `[t]start` or `[t]stop`

- Row 2 (`s/d/f/g` positions):
  - `[s]prev-random`
  - `[d]prev`
  - `[f]next`
  - `[g]next-random`

### Right-side view

- Row 1 (`y/u/o/p` positions):
  - `[y]start` or `[y]stop`
  - `[u]play` or `[u]pause`
  - `[o]new-random`
  - `[p]toggle-order`

- Row 2 (`h/j/k/l` positions):
  - `[h]prev-random`
  - `[j]prev`
  - `[k]next`
  - `[l]next-random`

The order is based on physical keyboard geometry, not simple list reversal.

## Top Folder Controls Ordering

Folder buttons are also side-dependent and follow numeric key geometry.

### Left-side view

- `[6]prev-folder`
- `[7]next-folder`
- `[8]reindex-folder`
- `[9]pick-folder`

### Right-side view

- `[2]pick-folder`
- `[3]reindex-folder`
- `[4]prev-folder`
- `[5]next-folder`

Reset/wipe buttons remain in their original order and are not part of side-dependent reordering.

The same row also includes a `mute` / `unmute` timer-sound toggle (no shortcut binding). The sound state is persisted via local storage and defaults to enabled.

Timer beeps are synthesized in the UI with `AudioContext` (no WAV path dependency at playback time):

- low beep at `remaining % 60 === 0` (excluding `0`)
- mid beep at `remaining === 30`
- high beep at `remaining` in `5..1`
