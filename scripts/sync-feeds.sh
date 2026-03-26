#!/usr/bin/env bash
# Sync feeds from FEED.md into the database.
# Adds any URLs not already present, skips duplicates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FEED_FILE="${1:-$PROJECT_DIR/FEED.md}"

if [ ! -f "$FEED_FILE" ]; then
  echo "Feed file not found: $FEED_FILE"
  exit 1
fi

added=0
skipped=0

while IFS= read -r url; do
  # Skip empty lines and comments
  url="$(echo "$url" | xargs)"
  [[ -z "$url" || "$url" == \#* ]] && continue

  output=$(cd "$PROJECT_DIR" && npx tsx src/index.ts add "$url" 2>&1) || true

  if echo "$output" | grep -q "already exists"; then
    skipped=$((skipped + 1))
  elif echo "$output" | grep -q "Added feed"; then
    echo "  + $url"
    added=$((added + 1))
  else
    echo "  ⚠ $url: $output"
  fi
done < "$FEED_FILE"

echo ""
echo "Done: $added added, $skipped already present"
