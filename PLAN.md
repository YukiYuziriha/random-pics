# Plan: Folder History Delete + Per-Folder Hidden Image Blacklists

## Goal

Implement UI and backend support for:

1. Deleting folders from **folder history only** (not filesystem).
2. Hiding image rows from **normal** and **random** histories independently.
3. Keeping hidden-image blacklists **per folder** and **per order mode** (2 blacklists per folder).
4. Clearing blacklists **only on folder reindex** (not on reset random/normal history).
5. Showing a centralized error toast when a folder has no visible images because all are hidden, with reindex suggestion.

---

## Current Architecture (Touchpoints)

- Frontend orchestration/state/toasts: `src/App.tsx`
- Shared history UI component: `src/components/HistoryPanel.tsx`
- Tauri invoke API wrappers/types: `src/apiClient.ts`
- Command adapters + error sanitization: `src-tauri/src/commands.rs`
- Tauri command registration: `src-tauri/src/lib.rs`
- Persistence/traversal/indexing logic: `src-tauri/src/img_loader.rs`
- DB schema + migrations: `src-tauri/src/db.rs`

---

## Phase 1: Normalize Data Contracts

### 1.1 Folder history row identity

- Ensure folder history payload includes `id` end-to-end.
- Align types between:
  - Rust `FolderHistoryItem` response model.
  - TS `FolderHistoryItem` in `src/apiClient.ts`.
  - Consumer code in `src/App.tsx` and `src/components/HistoryPanel.tsx`.

### 1.2 Image history row identity

- Replace path-only image history response shape with row objects carrying stable identity needed for hide-by-order semantics.
- Required fields should support:
  - display label/path,
  - click-to-jump behavior,
  - hide action payload (folder + mode + order identity).

### 1.3 Command arg consistency

- Verify and align argument naming for `delete_folder` invoke payload (`folder_id` vs camelCase mapping) so delete calls work reliably.

---

## Phase 2: Folder History Delete (UI + Backend Wiring)

### 2.1 UI behavior

- In folder history rows, show delete icon/button on hover, **left side** of row.
- Keep existing row click navigation behavior.
- Ensure delete click does not trigger row navigation (event isolation).

### 2.2 Frontend action flow

- Add folder-row delete handler in `src/App.tsx`.
- On delete success:
  - remove folder from displayed history (refresh from backend),
  - refresh current image/folder state if current folder was deleted.
- On error:
  - ignore filesystem-related failures per requirement (history removal is primary intent),
  - route user-visible failures through centralized error handling.

### 2.3 Backend semantics

- Reuse `delete_folder_by_id` path to remove DB/history records only.
- Do not add filesystem delete operations.

---

## Phase 3: Add Persistent Hidden-Image Blacklists

### 3.1 Schema additions

- Add migration-safe tables for hidden rows keyed by:
  - `folder_id`,
  - mode (`normal` or `random`) OR two dedicated tables,
  - order identity for that mode.
- Add indices/constraints to prevent duplicates.

### 3.2 Lifecycle cleanup

- Ensure hidden rows are deleted when:
  - folder is deleted,
  - full wipe runs.
- Preserve hidden rows during random/normal history reset.

### 3.3 Migration strategy

- Extend `run_migrations` in `src-tauri/src/db.rs` without destructive reset.
- Preserve existing user data.

---

## Phase 4: Hide API Surface

### 4.1 New commands

- Add commands to hide image row for:
  - normal history row,
  - random history row.
- Inputs must include folder + row identity (mode/order-aligned).

### 4.2 Registration and client wrappers

- Register commands in `src-tauri/src/lib.rs`.
- Add typed wrappers in `src/apiClient.ts`.

---

## Phase 5: History Read Filtering

### 5.1 Normal history filtering

- Exclude normal-blacklisted rows from `get_normal_history` response.
- Return current pointer relative to visible list semantics.

### 5.2 Random history filtering

- Exclude random-blacklisted rows from `get_random_history` response.
- Keep pointer/order handling stable with filtered view.

### 5.3 UI compatibility

- Update `src/App.tsx` + `src/components/HistoryPanel.tsx` to render new row shape and maintain current centered-window behavior.

---

## Phase 6: Traversal Logic with Hidden Lists

### 6.1 Normal traversal

- Ensure these skip normal-hidden rows:
  - current/next/prev,
  - set-by-index.

### 6.2 Random traversal

- Ensure these skip random-hidden rows:
  - force random,
  - next/prev random,
  - set-random-by-index.

### 6.3 Mode isolation

- Hidden in normal must not hide in random.
- Hidden in random must not hide in normal.

---

## Phase 7: Reindex/Reset Semantics

### 7.1 Reindex behavior

- On current-folder reindex, clear both blacklists for that folder.

### 7.2 Reset behavior

- `reset_normal_history`: must not clear any blacklist.
- `reset_random_history`: must not clear any blacklist.

### 7.3 Folder-scope guarantee

- Enforce blacklist scoping by folder id so each folder owns two independent blacklists.

---

## Phase 8: Image History Hide UI

### 8.1 UI affordance

- In image history rows (both normal/random), show hide button on hover, **right side** of row.

### 8.2 Interaction

- Clicking hide removes image from currently shown history list.
- Keep row click/jump intact; hide click should not trigger jump.

### 8.3 State refresh

- After hide action, reload active history and pointer from backend for consistency.

---

## Phase 9: Centralized Error Handling Extension

### 9.1 Backend error normalization

- Add explicit sanitized message mapping for hidden exhaustion case:
  - all images in folder hidden,
  - include suggestion to reindex.

### 9.2 Frontend centralization

- Route all relevant backend calls through shared error path (`runOp`/`handleBackendError`) including currently direct-call paths where practical.
- Ensure hidden-exhaustion always shows toast via one flow.

---

## Phase 10: Documentation Updates

- Update docs under `docs/` to capture:
  - per-folder/per-mode blacklist behavior,
  - reset vs reindex semantics,
  - user-facing hidden-all error behavior.

---

## Acceptance Checklist

- Folder row delete appears on hover (left), deletes history entry only.
- Image row hide appears on hover (right) in both history modes.
- Each folder has exactly two independent hidden sets (normal/random).
- Hidden sets survive random/normal history reset.
- Hidden sets clear on reindex of that folder.
- If all images become hidden for active mode in a folder, user gets centralized toast with reindex suggestion.
- No filesystem delete operation is introduced for folder-history delete.
