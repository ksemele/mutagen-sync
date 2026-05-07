#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR/sync-dirs/working/load-test"

usage() {
    echo "Usage: $0 [--many [COUNT [SIZE_KB]] | --big [SIZE_MB] | --clean]"
    echo ""
    echo "  --many [COUNT] [SIZE_KB]   Many small files (default: 500 x 200KB ≈ 100MB)"
    echo "  --big  [SIZE_MB]           One large file   (default: 300MB)"
    echo "  --clean                    Remove all generated files"
    echo ""
    echo "Files are written to sync-dirs/working/load-test/ and synced via demo-working."
}

clean() {
    if [ -d "$TARGET_DIR" ]; then
        echo "==> Removing $TARGET_DIR ..."
        rm -rf "$TARGET_DIR"
        echo "Done."
    else
        echo "Nothing to clean."
    fi
}

generate_many() {
    local count="${1:-500}"
    local size_kb="${2:-200}"
    local total_mb=$(( count * size_kb / 1024 ))
    echo "==> Generating $count files × ${size_kb} KB ≈ ${total_mb} MB in $TARGET_DIR ..."
    mkdir -p "$TARGET_DIR"
    for i in $(seq 1 "$count"); do
        dd if=/dev/urandom \
           of="$TARGET_DIR/$(printf 'file-%04d.bin' "$i")" \
           bs=1024 count="$size_kb" 2>/dev/null
        if (( i % 50 == 0 )); then
            printf "  %d / %d files written\n" "$i" "$count"
        fi
    done
    echo "Done — watch the extension switch to Syncing state."
}

generate_big() {
    local size_mb="${1:-300}"
    echo "==> Generating one ${size_mb} MB file at $TARGET_DIR/big.bin ..."
    mkdir -p "$TARGET_DIR"
    dd if=/dev/urandom of="$TARGET_DIR/big.bin" bs=1m count="$size_mb"
    echo "Done — watch the extension switch to Syncing state."
}

case "${1:---many}" in
    --many|-m) generate_many "${2:-500}" "${3:-200}" ;;
    --big|-b)  generate_big  "${2:-300}" ;;
    --clean|-c) clean ;;
    --help|-h|*) usage ;;
esac
