# Random Pics

Gesture Drawing clone - Tauri + WebGPU + TypeScript

## Setup

### Prerequisites

**Rust** (backend):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

**Node.js** (v20+ recommended):
```bash
# Using nvm
nvm install 20
nvm use 20
```

**System dependencies** (Linux):
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Install

```bash
npm install
```

### Run dev

```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Project Structure

```
src-tauri/src/
├── domain/      # Core business logic (playlist, timer, effects, session)
├── app/         # Application service layer
├── adapters/    # I/O adapters (database, scanner, GPU, clock)
└── commands/    # Tauri commands (exposed to frontend)

src/
├── components/  # React components
├── hooks/       # Custom React hooks
├── state/       # Global state management
└── lib/         # Utilities
```

See [PLAN.md](./PLAN.md) for detailed architecture.

## License

MIT License
