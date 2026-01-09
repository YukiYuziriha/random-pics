# PLAN.md — Tauri + WebGPU + TypeScript Architecture

> **Stack:** Rust (backend) + WebGPU (GPU effects) + TypeScript/React (UI) + Tauri (desktop framework)
>
> **Goal:** Gesture Drawing clone that handles 100k images with instant loading, real-time GPU effects, never freezes.

---

## 1. Executive Summary

**North Star KPI:** First image visible ≤ 500ms after folder selection, with 100k+ image libraries, zero UI freezes, GPU-accelerated effects at 60fps.

**Core Move:**
- **Rust backend** owns all I/O, database, decoding, and resource management
- **WebGPU compute shaders** handle all image effects (grayscale, blur, flip)
- **TypeScript/React UI** is purely presentational - no direct I/O
- **Tauri commands** are the ports/adapters layer

**Why This Stack Wins:**
| Problem | Python+PySide6 | Rust+Tauri+WebGPU |
|---------|----------------|-------------------|
| 100k folder scan | GIL blocks UI | `tokio` async, zero blocking |
| Image decode | Pillow (dated) | `image` crate + SIMD |
| Grayscale/blur | CPU, slow | GPU compute shaders |
| Memory safety | Runtime errors | Compile-time guarantees |
| Binary size | ~150MB (PyInstaller) | ~10MB |
| Startup | ~2s | <100ms |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Desktop App Process                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐    Tauri Commands (Port/Adapter Layer)    │
│  │   React/TypeScript  │ ←─────────────────────────────────────────┤
│  │        UI Layer     │    invoke('load_image', {id})             │
│  │                     │ ←─────────────────────────────────────────┤
│  │  - Image display    │    subscribe('timer_tick')                │
│  │  - Controls         │ ←─────────────────────────────────────────┤
│  │  - Timer overlay    │    emit('effect_changed', {type})         │
│  └─────────────────────┘                                            │
│           ↓                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Rust Backend                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │   Domain    │  │ Application │  │     Adapters        │   │   │
│  │  │  (Pure)     │  │  Service    │  │                     │   │   │
│  │  │             │  │             │  │  ┌───────────────┐  │   │   │
│  │  │ - Playlist  │←→│             │←→│  │ SQLite (WAL) │  │   │   │
│  │  │ - Timer     │  │ - Orchest  │  │  └───────────────┘  │   │   │
│  │  │ - Effects   │  │ - Gate      │  │  ┌───────────────┐  │   │   │
│  │  │ - State     │  │ - Cache     │  │  │ File Scanner  │  │   │   │
│  │  └─────────────┘  │ - Preload   │  │  └───────────────┘  │   │   │
│  │                   └─────────────┘  │  ┌───────────────┐  │   │   │
│  │                                    │  │ Thumb Cache   │  │   │   │
│  │                                    │  └───────────────┘  │   │   │
│  │                                    └─────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   WebGPU Compute Layer                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐  │   │   │
│  │  │ Grayscale│  │ Blur   │  │ Flip H  │  │ Texture Cache │  │   │   │
│  │  │ Shader  │  │ Shader │  │ Shader  │  │ (LRU, GPU)    │  │   │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────────┘  │   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Layer Responsibilities

### 3.1 UI Layer (TypeScript/React)
**Responsibility:** Presentation only. Zero business logic. Zero I/O.

```
State:         UIState (received from Rust via events)
Actions:       Dispatched via Tauri invoke (no direct effects)
Effects:       Applied via WebGPU shaders (controlled by Rust)
Rendering:     Canvas with WebGPU texture from Rust
```

**Key Components:**
- `ImageViewer` - Displays current image texture
- `ControlBar` - Next/prev, pause/play, folder select
- `TimerOverlay` - Countdown display (position, style configurable)
- `SettingsPanel` - Effect toggles, timer config

**Strict Rules:**
- Never `fs.readFile` - always `invoke('load_image', {id})`
- Never `new Image()` - always receive texture handle from Rust
- Never direct timer - always subscribe to `timer_tick` events

---

### 3.2 Domain Layer (Rust, Pure)
**Responsibility:** Business logic, invariants, state machines. No I/O.

```rust
// Core types (pure, no async)
struct Playlist { ... }      // Cursor, ordering, shuffle
struct Timer { ... }         // State machine (running/paused/elapsed)
struct Effect { ... }        // Effect type, intensity, toggle state
struct Session { ... }       // Current folder, playlist index, active effects

// Pure functions (testable without infrastructure)
fn next_image(playlist: &Playlist) -> ImageId;
fn apply_timer(timer: &Timer, delta: Duration) -> TimerState;
fn should_advance(timer: &Timer) -> bool;
```

**Key Invariants:**
- Playlist cursor is always valid (0..len)
- Timer never advances without displayed image
- Effects apply to displayed image only

---

### 3.3 Application Layer (Rust, Orchestrator)
**Responsibility:** Coordinates between domain, adapters, and UI.

```rust
struct AppService {
    domain: DomainState,
    repo: Arc<dyn Repo>,
    preloader: Preloader,
    gpu: GpuManager,
    emitter: EventEmitter,
}

// Key flows
async fn on_folder_selected(&self, path: String) -> Result<()>;
async fn on_next(&self) -> Result<()>;
async fn on_prev(&self) -> Result<()>;
async fn on_timer_tick(&self) -> Result<()>;
fn on_effect_toggle(&self, effect: Effect) -> Result<()>;
```

**Gating & Guarantees:**
- UI consume gated on `playlist_ready` signal
- Timer gated on `first_paint` complete
- Preloader LIFO with cancellation
- Bounded concurrent operations (configurable)

---

### 3.4 Adapter Layer (Rust, Infrastructure)
**Responsibility:** All I/O, external integrations, replaceable implementations.

| Adapter | Interface | Responsibility |
|---------|-----------|----------------|
| `Repo` | `trait Repo` | SQLite (WAL) metadata, folders, images |
| `Scanner` | `trait Scanner` | Incremental folder scan, batched |
| `ThumbCache` | `trait ThumbCache` | On-disk thumbnail cache, generation |
| `Decoder` | `trait Decoder` | Full-res image decode, GPU upload |
| `GpuManager` | `trait GpuManager` | WebGPU compute shaders, texture cache |
| `Clock` | `trait Clock` | Precise timing, timer ticks |
| `Emitter` | `trait Emitter` | UI event emission (Tauri events) |

---

## 4. Data Model (SQLite)

```sql
-- Same normalized schema from ARCHITECTURE-IMPROVED.md
-- This part is solid - keep it.

folders (
  id INTEGER PRIMARY KEY,
  abs_path TEXT NOT NULL UNIQUE,
  added_at DATETIME NOT NULL
)

images (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  abs_path TEXT NOT NULL UNIQUE,
  hash TEXT,
  width INTEGER,
  height INTEGER,
  exif_datetime DATETIME,
  timer_override_seconds INTEGER,  -- Per-image timer
  added_at DATETIME NOT NULL,
  last_seen_at DATETIME
)

-- New: GPU texture cache tracking
texture_cache (
  image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  gpu_handle INTEGER,                -- WebGPU texture ID
  last_used DATETIME NOT NULL,
  size_bytes INTEGER
)

CREATE INDEX idx_images_folder ON images(folder_id);
CREATE INDEX idx_images_folder_rel ON images(folder_id, rel_path);
CREATE INDEX idx_texture_cache_last_used ON texture_cache(last_used);
```

---

## 5. Folder Switch Bootstrap (Deterministic)

```
User selects folder
       ↓
UI: invoke('select_folder', {path})
       ↓
Rust AppService:
  1. repo.upsert_folder(path) → folder_id
  2. Spawn scanner task (tokio::spawn)
  3. Clear current playlist state
  4. Pause timer (emit('timer_paused'))
       ↓
Scanner (async, non-blocking):
  1. Batch scan (1000 files at a time)
  2. repo.upsert_images(folder_id, batch)
  3. On first insert: emit('first_insert', {folder_id})
       ↓
AppService receives first_insert:
  1. domain.build_playlist(folder_id) → playlist
  2. thumb_cache.ensure(playlist[0])
  3. decoder.decode_async(playlist[0])
  4. emit('playlist_ready', {first_image_id})
       ↓
UI receives playlist_ready:
  1. invoke('get_texture', {id: playlist[0]})
       ↓
Rust returns texture (thumb or full-res):
  1. gpu.get_or_create_texture(id) → texture_handle
  2. emit('image_ready', {texture, width, height})
       ↓
UI renders image:
  1. Display texture on canvas
  2. Apply active effects (via shader uniforms)
  3. emit('first_paint_complete')
       ↓
AppService receives first_paint_complete:
  1. resume_timer()
  2. Start preloading next/prev
```

**KPI Checkpoint:** `first_insert` → `first_paint_complete` ≤ 500ms

---

## 6. GPU Effects Architecture (WebGPU)

### 6.1 Compute Shaders

All effects run as WebGPU compute shaders on the GPU:

```
Input:  source_texture (read-only storage texture)
Output: effect_texture (storage texture, write-only)

Shaders:
  - grayscale.wgsl  : dot(rgb, vec3(0.299, 0.587, 0.114))
  - blur.wgsl       : 9-box gaussian (single pass for preview, 3-pass for quality)
  - flip_h.wgsl     : texture coordinate flip (free via transform)
  - flip_v.wgsl     : texture coordinate flip (free via transform)
  - invert.wgsl     : rgb = 1.0 - rgb
```

### 6.2 Effect Composition

Effects are composable and toggleable:

```
display_image = apply_effects(source_texture, active_effects)

active_effects: [Grayscale, Blur(amount: 0.5), FlipH]

Shader pipeline:
  source → grayscale → blur → flip_h → display
```

### 6.3 Texture Cache (GPU Memory)

```rust
struct GpuTextureCache {
    // LRU cache on GPU
    textures: HashMap<ImageId, GpuTexture>,
    max_size_bytes: usize,  // Configurable, default 512MB
    current_size_bytes: usize,
    lru: VecDeque<ImageId>,
}

impl GpuTextureCache {
    fn get_or_create(&mut self, id: ImageId) -> GpuTexture {
        // Cache hit: move to front of LRU
        // Cache miss: decode + upload, evict if needed
    }

    fn apply_effect(&mut self, texture: GpuTexture, effect: Effect) -> GpuTexture {
        // Dispatch compute shader
        // Return effect texture (cached per source+effect combo)
    }
}
```

---

## 7. Preloader & Caching Strategy

### 7.1 LIFO Preloader

```rust
struct Preloader {
    queue: VecDeque<ImageId>,      // LIFO: push front, pop front
    in_flight: HashSet<ImageId>,   // Track active work
    limit: usize,                  // Max concurrent (default: 3)
    cancellation: HashMap<ImageId, CancellationToken>,
}

impl Preloader {
    fn target(&mut self, id: ImageId) {
        // Cancel all in-flight except this target
        // Push to front of queue
        // Dispatch up to limit
    }
}
```

**Behavior:**
- User mashes "next" → only the latest image is decoded
- Rapid navigation converges to current target
- Prefetch next/prev when stable

### 7.2 Caching Hierarchy

```
Priority 0: Current image (GPU texture, all effects applied)
Priority 1: Next image (GPU texture, no effects)
Priority 2: Previous image (GPU texture, no effects)
Priority 3: Next±2, Prev±2 (thumb cache, disk)
Priority 4: All others (DB metadata only)

Eviction:
  - GPU cache: LRU, respect max_bytes
  - Thumb cache: LRU on disk
  - Never evict current or next/prev while active
```

---

## 8. Timer Architecture

### 8.1 Precise Timer (Rust)

```rust
struct Timer {
    state: TimerState,           // Idle, Running, Paused, Elapsed
    duration_seconds: u32,       // Configurable, per-session or per-image
    elapsed: Duration,
    last_tick: Instant,
}

impl Timer {
    fn tick(&mut self, delta: Duration) -> bool {
        // Returns true when elapsed (should advance)
        // Uses precise Instant::now(), not wall clock
    }
}
```

### 8.2 Timer Ticking Strategy

```
Rust backend:
  - tokio::spawn timer task (interval: 16ms ~ 60fps)
  - Each tick: calculate delta, update timer state
  - On elapsed: emit('timer_elapsed')
  - UI receives: update countdown display

UI:
  - Subscribe to 'timer_tick' events (60fps)
  - Update countdown overlay
  - Visual feedback only (no logic)
```

### 8.3 Per-Image Timer Override

```
1. images.timer_override_seconds (NULL = use session default)
2. When advancing: check next image for override
3. Update timer duration before starting
4. UI shows override indicator (icon, different color)
```

---

## 9. Threading & Concurrency

### 9.1 Rust Async Runtime (tokio)

```
Main Thread:
  - Tauri command handlers
  - UI event emission
  - GPU operations (WebGPU is thread-safe)

Tokio Runtime:
  - File scanner (async fs)
  - SQLite queries (async via `sqlx` or `rusqlite` with blocking task)
  - Image decoding (spawn_blocking)
  - Timer ticks (interval stream)

Worker Threads (blocking tasks):
  - Image decode (CPU-intensive)
  - Thumbnail generation
  - Database writes (WAL commits)
```

### 9.2 No-Freeze Guarantees

| Operation | Thread | Blocking? |
|-----------|--------|-----------|
| UI render | Main | ❌ Never |
| Tauri command | Main (async) | ❌ Never |
| File scan | Tokio | ❌ Async |
| Image decode | Worker | ✅ But spawned |
| DB query | Tokio/Worker | ❌ Async |
| GPU shader | GPU thread | ❌ Parallel |

**Key Rule:** Any `await` in a Tauri command must be truly async. Use `tokio::task::spawn_blocking` for CPU-bound work.

---

## 10. Error Handling

### 10.1 Error Taxonomy

```rust
enum AppError {
    // Domain errors (business logic violations)
    Domain(DomainError),

    // Infrastructure errors (external failures)
    Io(io::Error),
    Db(DbError),
    Decode(DecodeError),
    Gpu(GpuError),

    // Usage errors (invalid input)
    InvalidInput(String),
}
```

### 10.2 Error Handling Strategy

| Error Type | User Impact | Handling |
|------------|-------------|----------|
| Corrupt image | Skip image, continue | Log, mark in DB as invalid |
| Missing file | Skip image, continue | Log, offer to rescan folder |
| GPU init failure | Degrade to CPU | Fallback decoder, warn user |
| DB lock | Retry, timeout | Queue operation, show spinner |
| OOM | Cache flush | Flush GPU cache, thumb cache |

---

## 11. Observability

### 11.1 Metrics to Track

```
Folder Switch:
  - folder_switch_start
  - first_insert_ms
  - playlist_ready_ms
  - first_paint_ms
  - total_folder_switch_ms

Image Loading:
  - decode_ms (p50, p95, p99)
  - gpu_upload_ms
  - thumb_hit_rate
  - texture_cache_hit_rate

Preloader:
  - in_flight_count
  - cancelled_count
  - queue_depth

GPU:
  - texture_cache_size_bytes
  - active_textures
  - shader_dispatch_ms (per effect)

Timer:
  - timer_drift_ms (vs expected)
  - auto_advance_count
  - manual_advance_count
```

### 11.2 Logging Strategy

```
TRACE: Internal state transitions (for debugging race conditions)
DEBUG: Per-image operations (decode, cache miss/effect)
INFO: User actions, folder operations, errors
WARN: Performance regressions, cache pressure
ERROR: Failures, corrupt data
```

### 11.3 Tracing

Correlate folder switch end-to-end:

```
[folder_switch:abc123] scan_start
[folder_switch:abc123] first_insert (rows: 1000)
[folder_switch:abc123] playlist_ready
[folder_switch:abc123] thumb_cache_hit: false → generating
[folder_switch:abc123] thumb_ready (45ms)
[folder_switch:abc123] first_paint_complete
[folder_switch:abc123] total: 312ms ✓
```

---

## 12. Project Structure

```
random-pics/
├── src-tauri/                 # Rust backend
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs            # Tauri entry, command registration
│   │   ├── domain/            # Pure domain logic
│   │   │   ├── mod.rs
│   │   │   ├── playlist.rs
│   │   │   ├── timer.rs
│   │   │   ├── effect.rs
│   │   │   └── session.rs
│   │   ├── app/               # Application service
│   │   │   ├── mod.rs
│   │   │   └── service.rs
│   │   ├── adapters/          # Infrastructure
│   │   │   ├── mod.rs
│   │   │   ├── repo.rs        # SQLite
│   │   │   ├── scanner.rs     # File system
│   │   │   ├── thumb_cache.rs
│   │   │   ├── decoder.rs
│   │   │   ├── gpu.rs         # WebGPU manager
│   │   │   └── clock.rs
│   │   └── commands/          # Tauri command handlers
│   │       ├── mod.rs
│   │       ├── folder.rs
│   │       ├── navigation.rs
│   │       ├── timer.rs
│   │       └── effects.rs
│   ├── shaders/               # WGSL compute shaders
│   │   ├── grayscale.wgsl
│   │   ├── blur.wgsl
│   │   └── common.wgsl
│   └── migrations/            # SQL migrations
│       └── 001_initial.sql
├── src/                       # TypeScript/React frontend
│   ├── App.tsx
│   ├── components/
│   │   ├── ImageViewer.tsx
│   │   ├── ControlBar.tsx
│   │   ├── TimerOverlay.tsx
│   │   └── SettingsPanel.tsx
│   ├── hooks/
│   │   ├── useImage.ts
│   │   ├── useTimer.ts
│   │   └── useEffects.ts
│   ├── state/
│   │   └── store.ts           # UI state (Zustand/Jotai)
│   └── lib/
│       └── tauri.ts           # Tauri API wrappers
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tauri.conf.json
```

---

## 13. Phase Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Project scaffold (Tauri + Vite + React + TypeScript)
- [ ] Rust domain types (Playlist, Timer, Effect, Session)
- [ ] Tauri command skeleton (no-op handlers)
- [ ] UI shell (ImageViewer placeholder, ControlBar)
- [ ] Build verification (all platforms)

### Phase 2: Database & Scanner (Week 2)
- [ ] SQLite schema with migrations
- [ ] Repo adapter implementation
- [ ] Incremental folder scanner
- [ ] Tauri commands: `select_folder`, `scan_status`
- [ ] UI: Folder picker dialog
- [ ] Verify: 100k folder scan doesn't block UI

### Phase 3: Image Loading & Display (Week 3-4)
- [ ] Decoder adapter (image crate)
- [ ] Thumbnail cache generation
- [ ] GPU texture upload
- [ ] WebGPU rendering in UI
- [ ] Preloader with LIFO + cancellation
- [ ] Verify: First paint < 500ms on 10k folder

### Phase 4: GPU Effects (Week 5)
- [ ] WebGPU compute shader setup
- [ ] Grayscale shader
- [ ] Blur shader (multi-pass)
- [ ] Flip shaders (coordinate transform)
- [ ] Effect composition pipeline
- [ ] UI: Effect toggles
- [ ] Verify: Effects at 60fps on 4K image

### Phase 5: Timer & Auto-Advance (Week 6)
- [ ] Timer state machine
- [ ] Precise ticker (16ms interval)
- [ ] Per-image timer override
- [ ] Timer overlay UI
- [ ] Auto-advance on elapsed
- [ ] Verify: No timer drift over 1 hour

### Phase 6: Polish & Hardening (Week 7-8)
- [ ] Error handling (corrupt images, missing files)
- [ ] Observability (metrics, tracing)
- [ ] Cache tuning (GPU, thumb, texture)
- [ ] Stress testing (rapid navigation, huge folders)
- [ ] Settings persistence
- [ ] Packaging (Windows, macOS, Linux)

---

## 14. Acceptance Criteria

### Functional
- [ ] Select folder with 100k images → first image < 500ms
- [ ] Next/prev navigation responds within one frame
- [ ] Timer auto-advances accurately (±50ms over 30min)
- [ ] Effects (grayscale, blur, flip) apply instantly
- [ ] Per-image timer override respected
- [ ] UI never freezes, never requires restart

### Performance
- [ ] Folder switch: first paint ≤ 500ms (measured)
- [ ] Image decode: p95 < 200ms for 2K edge
- [ ] GPU effects: < 16ms per effect (60fps)
- [ ] Memory: ≤ 500MB at 100k images (indexed, not loaded)
- [ ] Binary size: ≤ 15MB per platform

### Reliability
- [ ] Zero UI freezes in 30min stress test
- [ ] Graceful handling of corrupt images (skip + log)
- [ ] Graceful handling of missing files (offer rescan)
- [ ] GPU fallback on unsupported hardware

---

## 15. Guardrails (Do Not Violate)

1. **UI never touches I/O** - All file/DB operations through Tauri commands
2. **Main thread never blocks** - All CPU work in `spawn_blocking`
3. **Timer gated on first paint** - Never advance to non-existent image
4. **Preloader LIFO enforced** - Latest target wins, cancel stale work
5. **GPU operations bounded** - Respect texture cache limits
6. **Domain stays pure** - No async, no I/O in domain layer
7. **Never clear DB on folder switch** - Use folder_id scoping
8. **All errors propagated to UI** - User sees what went wrong

---

## 16. Key Dependencies

**Rust:**
- `tauri` v2 - Desktop framework
- `tokio` - Async runtime
- `sqlx` or `rusqlite` - Database
- `image` - Image decoding
- `wgpu` - GPU abstraction (if needed, but Tauri exposes WebGPU directly)

**TypeScript:**
- `react` - UI framework
- `@tauri-apps/api` - Tauri client
- `@tauri-apps/plugin-fs` - File system access
- `zustand` or `jotai` - State management
- `vite` - Build tool

---

## 17. Open Questions (To Resolve)

1. **GPU sharing between Rust and WebGPU** - Can Rust upload textures that WebGPU reads? Or does upload happen via Tauri commands?
2. **Effect texture caching** - Cache per-image+effect combination, or recompute?
3. **Blur quality vs speed** - Single pass (fast) vs multi-pass (quality)?
4. **Thumb cache location** - Same folder as images, or centralized cache dir?
5. **Migration path from Python** - In-place DB migration or fresh start?

---

## 18. References

- [Tauri v2 Docs](https://v2.tauri.app)
- [WebGPU Shaders](https://sotrh.github.io/learn-wgpu)
- [Gesture Drawing App (reference)](https://apps.apple.com/us/app/gesture-drawing-app/id1552057070)
- Original: `local/ARCHITECTURE-KICKOFF.md`
- Original: `local/architecture_improved.md`
