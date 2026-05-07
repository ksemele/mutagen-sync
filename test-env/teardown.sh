#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Terminating Mutagen sessions..."
for session in demo-working demo-paused demo-broken; do
  mutagen sync terminate "$session" 2>/dev/null && echo "  terminated $session" || echo "  $session not found (already gone)"
done

echo "==> Removing SSH config entries..."
sed -i '' '/# BEGIN mutagen-test/,/# END mutagen-test/d' ~/.ssh/config 2>/dev/null || true

echo "==> Stopping and removing containers and volumes..."
docker compose down -v

echo "==> Removing generated files..."
rm -rf keys/ sync-dirs/

echo ""
echo "Done. All sessions, containers, volumes, and test files have been removed."
