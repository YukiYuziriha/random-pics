# random-pics — Architecture Kickoff

Purpose & Status
- Desktop, Python-only (PySide6 + Pillow) gesture-drawing app for large local photo libraries. Core is pure Python; SQLite (WAL) stores paths and timers. Current P0: freeze/empty display on fresh folder switch due to racy folder-scoped bootstrap and DB contention.

P0 Critical Bug (Summary)
- Symptom: After selecting a new folder, UI shows no image for a long time or needs restart.
- Likely causes (PLAN.md): writer/reader contention, unscoped refresh queries, racy sequencing, timer advancing before first render, preloader starvation.
- Success criteria: First image from new folder within 500ms of first insert; no freeze; UI responsive throughout.

Top Decisions (Rebuild)
- Hexagonal layering (Domain/App/Adapters) → lower coupling, testable seams.
- WAL + dedicated Writer and separate Reader → non-blocking UI during indexing.
- Active-folder gating for all queries → no synchronous clears; no cross-folder bleed.
- Preloader backpressure (<= cache size), non-target cancellation, LIFO → latest action converges.
- Eventual-consistency settle loop + watchdog → guarantees display of targeted image.

Plan of Attack (Weeks 1–2)
1) Active-folder gating
   - Add `LIKE :prefix` to all playlist queries; never clear DB on switch.
2) Folder-scoped bootstrap
   - On first insert commit: fetch newest 1–3 rows for prefix; display immediately; defer full shuffle.
3) Reader/Writer enforcement
   - Reader is read-only URI with `busy_timeout`; Writer commits per batch; verify WAL.
4) Timer gating
   - Pause on folder change and “previous” until first pixmap renders; resume after display.
5) Preloader policy
   - Cap in-flight (<= cache size); cancel non-targets; LIFO ordering; prefetch prev/next up to N.
6) Settle loop
   - Debounce 150–250ms; if displayed ≠ target, re-request; never treat cancelled future as terminal.
7) Telemetry
   - Log: dialog->cancel->first-insert, refresh start/end + row counts, preloader request/done, display latency, timer transitions.

Acceptance Criteria
- Folder switch:
  - First image < 500ms after first insert; no older-folder images shown.
  - UI remains responsive; no restart required.
- Navigation:
  - Previous renders within one decode; rapid next converges with settle loop.

Guardrails
- Keep decoding off UI thread; UI only gets QPixmap.
- Enforce image size caps (edge/pixels) and thumbnail-first bootstrap for huge images.
- Add contract tests for ports; keep domain pure.

References & Entry Points
- GEMINI.md — Source of truth for stack/perf rules.
- PLAN.md — RCA and bead IDs; acceptance criteria.
- Key files: `random_pics/core/{db.py,indexer.py,preloader.py,shuffle.py,timer.py}`, `random_pics/ui/{main.py,window.py,viewer.py,controls.py}`.

Quick Run
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python random_pics/app.py
```

Next Step
- Implement active-folder gating + folder-scoped bootstrap, enable logging, and verify acceptance with a medium folder.

