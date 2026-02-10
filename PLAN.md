# Timer + Fullscreen + Shortcut Capture Plan (No Code)

## Scope Restatement

Implement behavior changes without introducing new shortcut systems outside existing architecture:

1. Show countdown at bottom-right only in app fullscreen image mode.
2. Hide that countdown when timer is not active.
3. Manual image navigation (prev/next in normal and random) resets countdown to start duration and continues timer loop.
4. Manual navigation reset must not trigger immediate auto-serve.
5. Timer value input should commit on blur, Enter, and Space.
6. While holding `z` (left layout) or `/` (right layout), capture numeric typing into start/stop timer value.
7. During that hold-capture mode, block all other shortcuts (including numeric shortcuts).
8. On release of hold key, update initial/start-stop timer value only; do not alter current remaining play/pause value or restart/pause running timer.

## Existing Patterns To Reuse

- Keyboard dispatch is centralized in `src/App.tsx` (`handleKeyDown` inside the keydown effect).
- Shortcut lookup source of truth is `src/shortcuts.ts` (`SHORTCUT_REGISTRY` + `findActionByKey`).
- Timer lifecycle is centralized in `src/App.tsx` (`clearActiveTimer`, `startTimerCycle`, `handleToggleStartStop`, `handleTogglePausePlay`).
- Manual image navigation handlers already exist in `src/App.tsx` (`handlePrevImage`, `handleNextImage`, `handlePrevRandomImage`, `handleNextRandomImage`).
- Fullscreen rendering is isolated in `src/App.tsx` early return (`if (isFullscreenImage)`).
- Timer inputs are rendered in `src/components/ImageControls.tsx` and routed to App handlers.

## Implementation Plan

### 1) Add dedicated hold-to-edit capture mode in keyboard layer

Target: `src/App.tsx` key handling effect.

- Introduce explicit capture state/refs for:
  - whether capture mode is active,
  - which modifier key is held (`z` or `/`),
  - typed numeric buffer.
- Add `keydown`/`keyup` handling so that:
  - pressing and holding `z` or `/` enters capture mode,
  - while active, all normal shortcut routing is bypassed,
  - only numeric editing keys are accepted (`0-9`, `Backspace`, `Enter`, `Space`),
  - `Enter`/`Space` commits current buffer into initial/start-stop timer value,
  - releasing held modifier key commits buffer and exits capture mode.
- Prevent default behavior for consumed keys in capture mode so no accidental shortcut actions fire.
- Keep this logic inside the existing keyboard lifecycle pattern (single centralized event management).

### 2) Commit semantics for timer value inputs (blur + Enter + Space)

Target: `src/components/ImageControls.tsx` (UI events), `src/App.tsx` (existing setter handlers).

- Keep App-level numeric sanitation ownership unchanged (`sanitizeSeconds`, `handleInitialTimerSecondsChange`, `handleRemainingTimerSecondsChange`).
- Adjust input event wiring so commit happens on:
  - blur,
  - Enter,
  - Space.
- Ensure this applies to timer value entry behavior consistently with existing UI structure.

### 3) Manual navigation should restart countdown only (no immediate serve)

Target: `src/App.tsx` navigation handlers.

- Add a small helper in App timer domain for "restart countdown after manual navigation" that:
  - runs only when timer loop is currently active/running,
  - resets remaining seconds to initial loop start value,
  - restarts timer cycle from that value,
  - does not call image-serving logic directly.
- Invoke this helper after successful manual navigation in:
  - `handlePrevImage`,
  - `handleNextImage`,
  - `handlePrevRandomImage`,
  - `handleNextRandomImage`.
- Keep existing history-loading behavior untouched.

### 4) Fullscreen bottom-right timer display

Target: fullscreen render branch in `src/App.tsx`.

- Add a lightweight overlay element positioned bottom-right in fullscreen image view.
- Render it only when `isTimerRunning` is true.
- Display current `remainingTimerSeconds` there.
- Preserve existing fullscreen exit control and hover-reveal behavior.

### 5) Guarantee hold-capture changes only initial/start-stop value

Target: integration between capture mode and timer setters in `src/App.tsx`.

- Route capture commits exclusively through initial timer setter path.
- Do not call remaining timer setter from hold-capture flow.
- Do not pause, stop, clear, restart, or otherwise alter current running cycle when capture commit occurs.
- Running timer continues with current remaining value; new initial value applies to future cycles/stops as intended.

## Docs Update Plan

Update `docs/shortcuts-and-button-layout.md` to include:

- Hold-capture mode for `z`/`/`.
- Explicit rule that while hold-capture is active, other shortcuts are blocked.
- Commit keys (`Enter`, `Space`) and release-commit behavior.

## Verification Checklist (manual)

1. Enter fullscreen via button and via `x`/`.`; confirm timer appears only when running.
2. Stop timer; confirm fullscreen timer overlay disappears.
3. Start timer, manually navigate prev/next in normal and random; confirm countdown resets to initial value and keeps running.
4. Confirm no instant extra image serve occurs after manual navigation reset.
5. In timer input, test blur, Enter, Space commits.
6. Hold `z` and type digits; verify no other shortcuts trigger; release commits initial value only.
7. Hold `/` and repeat above in right layout.
8. While timer is actively counting down, hold-edit initial value; confirm current remaining countdown continues unchanged.
