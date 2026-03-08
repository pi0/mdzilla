#!/usr/bin/env bash
# Render a .cast recording to video using agg (asciinema gif generator)
set -euo pipefail

cd "$(dirname "$0")/.."

CAST_FILE="${1:-demo.cast}"
OUT_FILE="${2:-demo.gif}"

if [ ! -f "$CAST_FILE" ]; then
  echo "Error: $CAST_FILE not found. Run ./scripts/record-demo.sh first."
  exit 1
fi

echo "Rendering $CAST_FILE → $OUT_FILE..."
agg --font-size 16 --speed 1 "$CAST_FILE" "$OUT_FILE"
echo "Done! Output: $OUT_FILE"
