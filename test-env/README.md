# Mutagen Extension — Docker Test Environment

A manual test environment using Docker SSH containers to demonstrate the extension with multiple session states simultaneously.

## Prerequisites

- Docker (with Compose v2)
- Mutagen installed and `mutagen daemon` running (`mutagen daemon start`)
- `nc` (netcat) — available by default on macOS

## Session states demonstrated

| Session | State | How |
|---|---|---|
| `demo-working` | Watching ✅ | Syncs local dir ↔ ssh-alpha container |
| `demo-paused` | Paused ⏸ | Created then immediately paused |
| `demo-broken` | Disconnected ❌ | `ssh-beta` auto-stops ~30 seconds after setup |

## Usage

### 1. Start everything

```bash
./setup.sh
```

This will:
- Generate an SSH key pair in `keys/`
- Start two SSH server containers (`mutagen-test-alpha` on port 2221, `mutagen-test-beta` on port 2222)
- Create three Mutagen sessions
- Pause `demo-paused`
- Schedule `ssh-beta` to auto-stop after ~30 seconds (triggers `demo-broken` → Disconnected)

Open VSCode — all three sessions appear immediately. After ~30 seconds `demo-broken` will turn Disconnected on its own.

To restore the container without a full teardown:

```bash
docker compose start ssh-beta
```

### 2. Simulate an active sync (load test)

```bash
./gen-load.sh --many        # 500 files × 200 KB ≈ 100 MB (good for watching many-file sync)
./gen-load.sh --big         # one 300 MB file       (good for watching large-file sync)
./gen-load.sh --many 200 500  # custom: 200 files × 500 KB
./gen-load.sh --big 600       # custom: 600 MB
```

Files are written to `sync-dirs/working/` and picked up by `demo-working`. The extension will show the session switching to **Syncing** (spinning icon) for the duration of the transfer. After the sync completes it returns to **Watching**.

To remove the generated files:

```bash
./gen-load.sh --clean
```

### 3. Try terminating a session from the extension

Click the trash icon next to any session in the Mutagen Sync panel. A confirmation dialog will appear (can be disabled via `mutagen.confirmTerminate`). Terminating a session permanently removes it from Mutagen — it will disappear from the list on the next refresh.

### 3. Clean up

```bash
./teardown.sh
```

Terminates all remaining sessions, removes containers and Docker volumes, and deletes generated keys and sync directories.

## File structure

```
test-env/
├── docker-compose.yml   — two SSH server containers
├── setup.sh             — generate keys, start containers, create sessions
├── gen-load.sh          — generate files to trigger an active sync (--many / --big / --clean)
├── teardown.sh          — remove sessions, containers, and generated files
├── keys/                — generated SSH keys (git-ignored)
└── sync-dirs/           — local sync directories (git-ignored)
    ├── working/
    ├── paused/
    └── broken/
```
