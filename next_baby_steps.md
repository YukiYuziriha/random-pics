# Next Baby Steps (AppController + UI Wiring)

## Why the AppController exists
- `Playlist` is pure domain logic: given a list, it tracks a cursor and wraps; no UI/IO knowledge.
- `AppController` is the application layer that handles intents (next/prev/folder switch), owns the playlist, and is where orchestration will live (folder bootstrap, preload/decode, timer gating, metrics). UI stays dumb; domain stays pure.

## What to do now
1) Wire UI buttons to the controller:
   - Create one `AppController` instance.
   - In each button handler, call `on_next`/`on_prev`/`on_folder_selected` (with a fake list for now).
   - Set the label text from the returned value (or a placeholder when `None`).
2) Add a small pytest for `AppController`:
   - `on_folder_selected(["a","b"])` sets current to `"a"`.
   - `on_next()` cycles to `"b"` then back to `"a"`.
   - `on_prev()` cycles backwards correctly.
   - Empty list returns `None` without crashing.
3) Keep the contract visible:
   - Comment/docstring: “UI emits intents; controller owns playlist; no IO/Qt in controller; empty playlist returns None.”

## Next (future) layers to slot in here
- Folder-switch bootstrap: update playlist only when folder scan/index is ready; signal “playlist ready” to UI.
- Preload/decode queue with cancellation.
- Timer gating and lightweight metrics around folder switch and decode/preload.
