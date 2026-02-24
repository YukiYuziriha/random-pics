# Folder Tree + Recursive Selection Plan (No Code)

## 0) Regression Test Suite Plan (First Priority, No Corners Cut)

1. Build regression tests first, then implementation, so folder-tree work and checked-image materialization can be refactored safely without speed regressions.
2. Split tests by layer (small and deterministic), not giant Tauri end-to-end slices:
   - backend domain/unit tests (selection propagation, active-image set maintenance),
   - backend DB integration tests (migration + SQL behavior on realistic fixtures),
   - command-level tests (error sanitization + command preconditions),
   - frontend reducer/selector tests (tri-state tree logic and derived checked scope).
3. Add explicit performance regression tests for the critical path (random image fetch after selection is already computed):
   - baseline median and p95 before change,
   - post-change must be <= baseline threshold (no user-visible slowdown),
   - fixture sizes: small, medium, very large image sets.
4. Define "done" gates for each phase:
   - all new tests green,
   - migration tests green on existing DB snapshots,
   - random-load performance gate passes,
   - `bun tsc` passes after code changes.
5. Keep a strict test matrix for all behavior that can regress:
   - recursive check/uncheck,
   - indeterminate derivation,
   - exclusive select,
   - empty-selection error path,
   - active-image table synchronization on check/uncheck/reindex/delete/startup-restore.

## 1) Scope Restatement

1. Replace current flat folder panel behavior with a recursive folder tree view.
2. Each folder row always shows a checkbox.
3. Each folder row shows an expand/collapse arrow on the right for subfolder toggling.
4. Checkbox behavior is recursive at any depth:
   - checking parent checks all descendants,
   - unchecking parent unchecks all descendants,
   - partially selected descendants put parent in indeterminate state.
5. Double-clicking any folder performs exclusive selection: all folders become unchecked except that folder.
6. New image candidate generation (normal/random/timer/manual choose) must always reflect the live set of currently checked folders.
7. Random history traversal is app-wide and checkmark-agnostic; checkmark changes must not mutate, filter, or reorder random history.
8. If zero folders are checked, commands that require generating a new image must fail with a user-facing error instructing to check folders.
9. Checkbox rules, error rules, and selection-derived behavior use centralized single sources of truth.
10. Folder row single-click expands/collapses children; right-side arrow also expands/collapses and rotates with state.
11. Checkbox state for every folder persists in DB.
12. Every folder row always shows image count for that folder subtree (recursive descendant-inclusive count).
13. Random-image loading must keep current speed profile (no regression).

## 2) Current State (from codebase)

1. Folder UI is currently a history window rendered via `src/components/HistoryPanel.tsx` and mounted in `src/App.tsx`.
2. Folder data currently comes from history APIs (`getFolderHistory`, `setFolderByIndex`, prev/next folder commands), not a hierarchical tree model.
3. Frontend async operation handling is centralized via `runOp` + `handleBackendError` + toast formatting in `src/App.tsx`.
4. Backend error message shaping is centralized by `sanitize_error_message` in `src-tauri/src/commands.rs`.
5. Folder indexing currently scans recursively for images under a selected folder path in `src-tauri/src/img_loader.rs`, but folder selection itself is one-folder-at-a-time state.
6. Current image filtering path is at risk of repeatedly filtering broad image sets; plan must move this cost away from per-image-load operations.

## 3) Performance Invariants (Non-Negotiable)

1. Critical path for serving next/prev/random image must avoid full-table filtering by checked folders on every request.
2. Selection-change events may do heavier maintenance work, but image-serving commands must stay O(1) or near-constant DB work per fetch.
3. Query plan for random fetch must use indexes against pre-materialized active image set, not scan full images table.
4. Any added table/index/migration must preserve startup reliability and must not delete existing DB files.
5. Performance telemetry/bench numbers are required before and after to validate "no speed loss".
6. Random history operations remain independent of checked-folder filters to preserve app-wide history semantics.

## 4) Architecture Principles (hard requirements)

1. Create one centralized folder-selection domain object (single source of truth) in frontend state.
2. Keep all parent/child checkbox propagation and indeterminate derivation inside that domain object (no ad-hoc local checkbox logic in UI rows).
3. Keep one centralized "effective active folders" selector derived from that domain state for all new-candidate image operations.
4. Keep one centralized error mapping path (backend sanitize + frontend formatter + UI toast) with explicit no-checked-folders case.
5. Prevent duplicated branching logic in click handlers by routing folder actions through dedicated reducers/helpers.
6. Add one backend source of truth for "currently active image IDs" so read-path commands do not re-filter the whole corpus each time.
7. Keep random-history domain logic independent from checked-scope domain logic.

## 5) Data Model Plan (frontend)

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

## 6) New DB Tables Plan (Checked Scope + Active Images)

1. Add additive schema migration for persistent checked state and precomputed active image set:
   - `checked_folders` table (folder key/path primary key, checked flag or presence semantics),
   - `active_images` table (image id primary key; optional metadata columns only if needed for query path).
2. Persist recursive directories as distinct folder entities (stable folder ID + parent relation), so checked scope and subtree operations are explicit and indexable.
3. Add indexes required for constant-time read path:
   - unique/index on `active_images.image_id`,
   - any supporting index for joining back to image metadata/order tables.
4. Keep write-path synchronization transactional:
   - when selection changes, update `checked_folders` and refresh only impacted rows in `active_images` in one transaction,
   - never leave checked scope and active images out of sync.
5. Define update strategy for subtree check/uncheck:
   - compute affected folder keys once,
   - apply set-based SQL operations (`INSERT ... SELECT`, `DELETE ... WHERE ...`) scoped to those keys,
   - avoid per-image loops in application code.
6. Handle overlap/idempotency safely:
   - repeated check/uncheck operations should be no-op safe,
   - duplicate active image IDs prevented by PK/unique constraint.
7. Keep migration strictly additive and backward-safe (no DB file recreation, no destructive rewrite).
8. Do not couple `random_history` maintenance to checkmark changes; no history rewrites on subtree check/uncheck.

## 7) Tree Source and Synchronization Plan

1. Build a folder tree loader flow that can populate parent-child relationships and refresh safely after indexing/deletion.
2. Reconcile incoming folder data with existing UI state:
   - preserve expanded state where possible,
   - preserve checked state for still-existing nodes,
   - drop orphaned keys,
   - recompute indeterminate states once at end.
3. Ensure single refresh entrypoint is used after all relevant operations (pick, reindex, delete, startup restore).
4. Add one selector that returns "checked folders available for new image generation" and is used by candidate-generation operations only.
5. On refresh/index/delete, synchronize `active_images` incrementally so image fetch path remains fast immediately after data changes.

## 8) Interaction Rules Plan

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

## 9) Image Flow Integration Plan

1. Replace single-folder precondition (`ensureFolderSelected`) with centralized "has checked folders" precondition for new candidate generation.
2. Route candidate-generation entry points (force-random/new-random-source, normal next-source, manual source pick, timer source fetch) through the same precondition check.
3. Keep random-history traversal entry points checkmark-agnostic (no precondition and no filtering by checked scope).
4. Make candidate read path consume `active_images` as the primary scope instead of filtering entire image corpus each call.
5. Build candidate order as the compound union of images from all currently checked folders/subtrees.
6. Ensure selection changes during running timer do live updates for future generated images without stale folder assumptions.
7. On selection becoming empty, block only new generation commands with actionable error; preserve random-history navigation behavior.

## 10) Error Handling Extension Plan

1. Add explicit domain error for empty checked-folder selection only in backend command path(s) that generate new images.
2. Add explicit sanitize mapping for this error in `sanitize_error_message` so user text is stable.
3. Keep frontend error handling centralized via existing `runOp`/`handleBackendError`; no per-button toast text duplication.
4. Standardize user-facing copy to: "No folders selected. Check at least one folder."
5. Ensure startup and reload paths surface this error only when attempting new generation, not while traversing existing random history.

## 11) Backend Capability Plan

1. Add command/API support to pass active checked folder scope for selection-change operations and candidate generation.
2. Keep backend as source of truth for image ordering rules while reading candidate IDs from `active_images`.
3. Ensure random-candidate generation and normal mode both apply identical checked-folder filtering semantics by sharing the same materialized active set.
4. Validate folder scope input and return structured errors for empty/invalid scope.
5. Preserve existing DB file and migration safety rules; schema extension must be additive only.
6. Add a recovery path that can fully rebuild `active_images` from `checked_folders` + indexed images if mismatch is detected.
7. Keep `random_history` app-wide and immutable under checkmark changes; history updates happen only when new random images are actually served.

## 12) UI Rendering Plan

1. Replace folder history list rendering with a tree-capable folder panel component.
2. Row layout order: checkbox (always visible), label with recursive image count, right-side arrow toggle.
3. Add indentation per depth for readability while preserving current visual language.
4. Reflect tri-state checkbox visually and accessibly (`checked`, `indeterminate`, `unchecked`).
5. Ensure event boundaries are explicit:
   - checkbox click toggles selection only,
   - row single-click toggles expansion,
   - arrow click toggles expansion,
   - row double-click triggers exclusive select.

## 13) Documentation Update Plan

1. Update `docs/shortcuts-and-button-layout.md` only if folder interactions add/alter shortcuts.
2. Add a new doc in `docs/` describing folder tree selection semantics:
   - recursion,
   - indeterminate parent behavior,
   - exclusive double-click behavior,
   - error behavior when no folders are checked.
3. Add a backend doc note describing:
   - `checked_folders` and `active_images` purpose,
   - synchronization triggers,
   - random-history independence from checkmark changes,
   - recovery rebuild flow,
   - performance invariants and why this avoids per-load full filtering.

## 14) Verification Plan

1. Tree rendering: nested folders display correctly; arrows expand/collapse recursively at multiple depths.
2. Checkbox recursion: parent check/uncheck propagates to all descendants.
3. Indeterminate: parent shows partial state when some children differ.
4. Exclusive select: double-click on any level leaves only that folder checked.
5. Active-set sync: check/uncheck/exclusive select updates `active_images` correctly and atomically.
6. Live updates: changing checks immediately impacts newly generated images (normal/random/timer/manual source paths).
7. Random-history invariant: check/uncheck does not mutate/filter/reorder history; prev/next random traverses full app-wide history timeline.
8. Empty selection: new-image generation attempts show clear "check folders" error.
9. Error consistency: same empty-selection message appears across all new-generation paths.
10. Performance: random generation latency and throughput are at least as fast as baseline under large fixtures.
11. Regression: existing non-folder features still work (timer, history panel behavior for images, fullscreen, shortcuts).
12. Type safety: run `bun tsc` after implementation changes.

## 15) Risks and Mitigations

1. Risk: state drift between UI tree, `checked_folders`, and `active_images`.
   - Mitigation: single transactional update path + rebuild command + invariant checks in tests.
2. Risk: recursive updates causing performance issues on large trees.
   - Mitigation: normalized maps + iterative traversal helpers + set-based SQL operations.
3. Risk: click/double-click ambiguity causing accidental toggles.
   - Mitigation: strict event target handling and debounced double-click semantics.
4. Risk: inconsistent error copy from different layers.
   - Mitigation: keep backend sanitize mapping and frontend formatter path centralized.
5. Risk: materialized active set becoming stale after reindex/delete.
   - Mitigation: force sync hooks on index mutations and add periodic/full rebuild fallback.
6. Risk: accidental coupling that filters history by current checks.
   - Mitigation: separate command paths/tests for random-history traversal vs new random generation.

## 16) Suggestions and Decisions

1. Suggestion: keep checked-folder selection persisted between app launches in existing `state` persistence flow; this prevents surprise resets.
2. Suggestion: keep a small "N folders selected" indicator near the folder panel for fast visibility.
3. Decision: double-click exclusive select does NOT auto-expand the folder.
4. Decision: checking a deep child does NOT auto-expand ancestors.
5. Decision: when parent is indeterminate and parent checkbox is clicked, apply full-check to parent subtree.
6. Decision: random history is app-wide and checkmark-agnostic; checkmark changes never rewrite/filter history.

## 17) Recursive Count Plan

1. Reuse existing image counting semantics from current folder system as baseline, but compute/store counts for all tree nodes.
2. Define count contract clearly: displayed count = total images in that folder and all descendant folders.
3. Ensure count values are available for both expanded and collapsed nodes (always visible in row label).
4. Refresh counts through the same centralized tree refresh path after indexing, deletion, and folder selection changes.
5. Keep count computation centralized (backend-preferred) to avoid duplicated recursive count logic in UI.
