#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Generating SSH key pair..."
mkdir -p keys
if [ ! -f keys/id_ed25519 ]; then
  ssh-keygen -t ed25519 -f keys/id_ed25519 -N "" -C "mutagen-test"
fi

echo "==> Starting containers..."
docker compose up -d

echo "==> Waiting for ssh-alpha (port 2221)..."
for i in $(seq 1 30); do
  nc -z localhost 2221 2>/dev/null && break
  sleep 1
done
nc -z localhost 2221 2>/dev/null || { echo "ERROR: ssh-alpha did not become ready"; exit 1; }

echo "==> Waiting for ssh-beta (port 2222)..."
for i in $(seq 1 30); do
  nc -z localhost 2222 2>/dev/null && break
  sleep 1
done
nc -z localhost 2222 2>/dev/null || { echo "ERROR: ssh-beta did not become ready"; exit 1; }

# Allow extra time for sshd to finish key setup inside the containers
sleep 3

echo "==> Writing SSH config entries..."
mkdir -p ~/.ssh
# Remove any leftover entries from a previous run
sed -i '' '/# BEGIN mutagen-test/,/# END mutagen-test/d' ~/.ssh/config 2>/dev/null || true
cat >> ~/.ssh/config << EOF
# BEGIN mutagen-test
Host mutagen-test-alpha
  HostName localhost
  Port 2221
  User mutagen
  IdentityFile $SCRIPT_DIR/keys/id_ed25519
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
Host mutagen-test-beta
  HostName localhost
  Port 2222
  User mutagen
  IdentityFile $SCRIPT_DIR/keys/id_ed25519
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
# END mutagen-test
EOF

echo "==> Creating local sync directories..."
mkdir -p sync-dirs/working sync-dirs/paused sync-dirs/broken

echo "==> Creating Mutagen sessions..."

# demo-working: stays in Watching/Syncing state
mutagen sync create \
  --name demo-working \
  "$SCRIPT_DIR/sync-dirs/working" \
  "mutagen@mutagen-test-alpha:/sync"

# demo-paused: created then immediately paused
mutagen sync create \
  --name demo-paused \
  "$SCRIPT_DIR/sync-dirs/paused" \
  "mutagen@mutagen-test-alpha:/sync"

# demo-broken: ssh-beta auto-stops after 30s to trigger Disconnected state
mutagen sync create \
  --name demo-broken \
  "$SCRIPT_DIR/sync-dirs/broken" \
  "mutagen@mutagen-test-beta:/sync"

echo "==> Pausing demo-paused session..."
mutagen sync pause demo-paused

echo "==> Scheduling auto-break in 30 seconds (will stop ssh-beta)..."
(sleep 30 && docker compose stop ssh-beta && echo "[auto-break] ssh-beta stopped — demo-broken is now Disconnected") &

echo ""
echo "Done. Three sessions are now active:"
echo "  demo-working  — should show Watching in the extension"
echo "  demo-paused   — should show Paused in the extension"
echo "  demo-broken   — will auto-disconnect in ~30 seconds"
echo ""
echo "To clean up: ./teardown.sh"
