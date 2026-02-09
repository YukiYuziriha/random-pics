# Local Bun Server Security Concerns

This app uses a local Bun HTTP server as the backend for the Tauri desktop UI.
The model is convenient, but it introduces a local attack surface that should be treated explicitly.

## Scope

- Backend process: `server.ts`
- Desktop host + capabilities: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`
- Data/state mutation flow: `src/imgLoader.ts`

## Current model

- Tauri opens `http://127.0.0.1:3000` in production (`src-tauri/tauri.conf.json`).
- A local Bun server exposes `/api/*` endpoints (`server.ts`).
- In release, Rust starts the backend binary and waits for `127.0.0.1:3000` (`src-tauri/src/lib.rs`).

## Security concerns

1. Listener interface is not explicit in backend code.
   - `Bun.serve` in `server.ts` sets `port` but not `hostname`.
   - This leaves exposure dependent on runtime defaults/configuration instead of an explicit loopback bind in code.

2. API does not authenticate callers.
   - Endpoints are callable based on URL/method only.
   - Any process that can reach the port can trigger API actions.

3. High-impact mutating operations are exposed.
   - State-changing endpoints include folder selection/reindex, history resets, full wipe, and UI/state mutation.
   - `FULL_WIPE` and reset endpoints have no additional guardrails beyond HTTP method.

4. Some state-changing behavior is available via GET routes.
   - Navigation endpoints such as next/prev/random update persisted state/history.
   - GET-based mutation increases risk from accidental or cross-site request triggering.

5. Filesystem path disclosure risk.
   - Folder history APIs return absolute or user-selected paths.
   - This leaks local filesystem structure to anything that can read the API responses.

6. CSP is disabled in Tauri config.
   - `"csp": null` means no content security policy enforcement in the webview.
   - Any frontend injection flaw has fewer runtime mitigations.

## Existing mitigations

- Tauri window URL is fixed to local backend URL.
- Capabilities restrict remote plugin scope to localhost patterns.
- Static file serving is constrained to index + dist asset paths.
- Some destructive routes already require POST.

## Hardening plan

1. Set explicit loopback bind in `server.ts`.
   - Configure `hostname: "127.0.0.1"` in `Bun.serve`.

2. Add request authentication for `/api/*`.
   - Generate a per-launch secret in Rust and pass to backend via env.
   - Require this token (header) on mutating endpoints at minimum.

3. Convert mutating GET routes to POST.
   - Keep GET read-only.
   - Add request origin checks for browser-originated traffic.

4. Validate and constrain folder paths.
   - Require existing directory paths.
   - Optionally enforce an allowlist root strategy for packaged app mode.

5. Avoid returning absolute paths in API payloads.
   - Return display names or redacted values where possible.

6. Replace `csp: null` with a restrictive policy that still permits app functionality.

## Verification checklist

- Confirm local server is reachable only on loopback.
- Confirm unauthenticated API requests are rejected.
- Confirm destructive endpoints are POST-only and protected.
- Confirm folder APIs do not leak absolute paths unless intentionally required.
- Confirm CSP is active and does not break expected UI behavior.
