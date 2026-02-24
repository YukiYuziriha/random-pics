# Folder Tree + Recursive Selection Plan (No Code)

## 1) Scope Restatement

1. Replace current flat folder panel behavior with a recursive folder tree view.
2. Each folder row always shows a checkbox.
3. Each folder row shows an expand/collapse arrow on the right for subfolder toggling.
4. Checkbox behavior is recursive at any depth:
   - checking parent checks all descendants,
   - unchecking parent unchecks all descendants,
   - partially selected descendants put parent in indeterminate state.
5. Double-clicking any folder performs exclusive selection: all folders become unchecked except that folder.
6. Image loading, image order, and history traversal must always reflect the live set of currently checked folders.
7. If zero folders are checked, loading images must fail with a user-facing error instructing to check folders.
8. Checkbox rules, error rules, and selection-derived behavior use centralized single sources of truth.
9. Folder row single-click expands/collapses children; right-side arrow also expands/collapses and rotates with state.
10. Checkbox state for every folder persists in DB.
11. Every folder row always shows image count for that folder subtree (recursive descendant-inclusive count).

## 2) Current State (from codebase)

1. Folder UI is currently a history window rendered via `src/components/HistoryPanel.tsx` and mounted in `src/App.tsx`.
2. Folder data currently comes from history APIs (`getFolderHistory`, `setFolderByIndex`, prev/next folder commands), not a hierarchical tree model.
3. Frontend async operation handling is centralized via `runOp` + `handleBackendError` + toast formatting in `src/App.tsx`.
4. Backend error message shaping is centralized by `sanitize_error_message` in `src-tauri/src/commands.rs`.
5. Folder indexing currently scans recursively for images under a selected folder path in `src-tauri/src/img_loader.rs`, but folder selection itself is one-folder-at-a-time state.

## 3) Architecture Principles (hard requirements)

1. Create one centralized folder-selection domain object (single source of truth) in frontend state.
2. Keep all parent/child checkbox propagation and indeterminate derivation inside that domain object (no ad-hoc local checkbox logic in UI rows).
3. Keep one centralized "effective active folders" selector derived from that domain state for all image operations.
4. Keep one centralized error mapping path (backend sanitize + frontend formatter + UI toast) with explicit no-checked-folders case.
5. Prevent duplicated branching logic in click handlers by routing folder actions through dedicated reducers/helpers.

## 4) Data Model Plan (frontend)

1. Introduce a normalized tree state model:
   - `FolderNode` identity (stable key/path/id),
   - `parentKey`, ordered `childrenKeys`,
   - UI state: `expanded`,
   - selection state: `checked` + derived `indeterminate`.
2. Keep a root-level registry/map for O(1) lookup and recursive traversal helpers.
3. Track one derived array/set of active checked folder keys for backend calls.
4. Add a deterministic flattening selector for render order (preorder DFS respecting expanded state).
5. Keep double-click timestamp or click-count handling outside selection reducer; reducer receives explicit semantic action (`exclusiveSelect`).
6. Persist checked/unchecked state to backend storage and hydrate it on startup as part of initialization.

## 5) Tree Source and Synchronization Plan

1. Build a folder tree loader flow that can populate parent-child relationships and refresh safely after indexing/deletion.
2. Reconcile incoming folder data with existing UI state:
   - preserve expanded state where possible,
   - preserve checked state for still-existing nodes,
   - drop orphaned keys,
   - recompute indeterminate states once at end.
3. Ensure single refresh entrypoint is used after all relevant operations (pick, reindex, delete, startup restore).
4. Add one selector that returns "checked folders available for image serving" and is used everywhere image operations start.

## 6) Interaction Rules Plan

1. Single-clicking a folder row toggles expand/collapse state for that node.
2. `toggleExpand(folder)` (arrow click) performs the same expand/collapse action as row single-click.
3. Arrow icon direction always reflects current state (`collapsed` vs `expanded`) immediately after toggle.
4. `toggleCheck(folder, targetChecked)` applies recursively to descendants and then bubbles derived parent states upward.
5. `exclusiveSelect(folder)` unchecks everything, checks that folder, then recomputes ancestors/descendants consistently.
6. Keep click semantics non-conflicting:
   - checkbox click toggles selection only,
   - row single-click toggles expand/collapse only,
   - row double-click triggers exclusive select only,
   - arrow click toggles expand/collapse only.
7. Guarantee keyboard shortcuts and timer flows continue working because folder actions remain isolated to folder domain handlers.

## 7) Image Flow Integration Plan

1. Replace single-folder precondition (`ensureFolderSelected`) with centralized "has checked folders" precondition.
2. Route all image-serving entry points (current/next/prev/random/manual index/timer flow) through the same precondition check.
3. Ensure history/order updates always reload based on current checked-folder set after any selection change.
4. Ensure selection changes during running timer do live updates without stale folder assumptions.
5. On selection becoming empty, clear stale image context safely and emit actionable error.

## 8) Error Handling Extension Plan

1. Add explicit domain error for empty checked-folder selection in backend command path(s) that fetch images.
2. Add explicit sanitize mapping for this error in `sanitize_error_message` so user text is stable.
3. Keep frontend error handling centralized via existing `runOp`/`handleBackendError`; no per-button toast text duplication.
4. Standardize user-facing copy to: "No folders selected. Check at least one folder."
5. Ensure startup and reload paths also surface this error consistently rather than silently failing.

## 9) Backend Capability Plan

1. Add command/API support to pass active checked folder scope for image queries and history construction.
2. Keep backend as source of truth for image ordering rules while accepting folder-scope filter as input.
3. Ensure random and normal modes both apply identical checked-folder filtering semantics.
4. Validate folder scope input and return structured errors for empty/invalid scope.
5. Preserve existing DB file and migration safety rules; if schema extension is needed, implement additive migration only.

## 10) UI Rendering Plan

1. Replace folder history list rendering with a tree-capable folder panel component.
2. Row layout order: checkbox (always visible), label with recursive image count, right-side arrow toggle.
3. Add indentation per depth for readability while preserving current visual language.
4. Reflect tri-state checkbox visually and accessibly (`checked`, `indeterminate`, `unchecked`).
5. Ensure event boundaries are explicit:
   - checkbox click toggles selection only,
   - row single-click toggles expansion,
   - arrow click toggles expansion,
   - row double-click triggers exclusive select.

## 11) Documentation Update Plan

1. Update `docs/shortcuts-and-button-layout.md` only if folder interactions add/alter shortcuts.
2. Add a new doc in `docs/` describing folder tree selection semantics:
   - recursion,
   - indeterminate parent behavior,
   - exclusive double-click behavior,
   - error behavior when no folders are checked.
3. Add a short backend note documenting folder-scope filtering in image commands and error sanitization policy.

## 12) Verification Plan

1. Tree rendering: nested folders display correctly; arrows expand/collapse recursively at multiple depths.
2. Checkbox recursion: parent check/uncheck propagates to all descendants.
3. Indeterminate: parent shows partial state when some children differ.
4. Exclusive select: double-click on any level leaves only that folder checked.
5. Live updates: changing checks immediately impacts next/prev/random/timer-served images.
6. Empty selection: image load attempts show clear "check folders" error.
7. Error consistency: same empty-selection message appears across all image-loading paths.
8. Regression: existing non-folder features still work (timer, history panel behavior for images, fullscreen, shortcuts).
9. Type safety: run `bun tsc` after implementation changes.

## 13) Risks and Mitigations

1. Risk: state drift between UI tree and backend scope.
   - Mitigation: single derived active-folder selector used for every command call.
2. Risk: recursive updates causing performance issues on large trees.
   - Mitigation: normalized maps + iterative traversal helpers + batched state updates.
3. Risk: click/double-click ambiguity causing accidental toggles.
   - Mitigation: strict event target handling and debounced double-click semantics.
4. Risk: inconsistent error copy from different layers.
   - Mitigation: keep backend sanitize mapping and frontend formatter path centralized.

## 14) Suggestions and Questions

1. Suggestion: keep checked-folder selection persisted between app launches in existing `state` persistence flow; this prevents surprise resets.
2. Suggestion: keep a small "N folders selected" indicator near the folder panel for fast visibility.
3. Decision: double-click exclusive select does NOT auto-expand the folder.
4. Decision: checking a deep child does NOT auto-expand ancestors.
5. Decision: when parent is indeterminate and parent checkbox is clicked, apply full-check to parent subtree.

## 15) Recursive Count Plan

1. Reuse existing image counting semantics from current folder system as baseline, but compute/store counts for all tree nodes.
2. Define count contract clearly: displayed count = total images in that folder and all descendant folders.
3. Ensure count values are available for both expanded and collapsed nodes (always visible in row label).
4. Refresh counts through the same centralized tree refresh path after indexing, deletion, and folder selection changes.
5. Keep count computation centralized (backend-preferred) to avoid duplicated recursive count logic in UI.
