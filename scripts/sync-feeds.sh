#!/usr/bin/env bash
# Sync feeds from FEED.md into the database.
# Adds URLs not already present, removes URLs no longer in the file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FEED_FILE="${1:-$PROJECT_DIR/FEED.md}"

if [ ! -f "$FEED_FILE" ]; then
  echo "Feed file not found: $FEED_FILE"
  exit 1
fi

# Collect desired URLs from file (skip blanks and comments)
desired=$(while IFS= read -r line; do
  url="$(echo "$line" | xargs)"
  [[ -z "$url" || "$url" == \#* ]] && continue
  echo "$url"
done < "$FEED_FILE" | sort -u)

# Add missing feeds
added=0
skipped=0

while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  output=$(cd "$PROJECT_DIR" && npx tsx src/index.ts add "$url" 2>&1) || true

  if echo "$output" | grep -q "already exists"; then
    skipped=$((skipped + 1))
  elif echo "$output" | grep -q "Added feed"; then
    echo "  + $url"
    added=$((added + 1))
  else
    echo "  ⚠ $url: $output"
  fi
done <<< "$desired"

# Remove feeds not in file
removed=0
current=$(cd "$PROJECT_DIR" && npx tsx src/index.ts list 2>&1 | grep "^  • " | sed 's/^  • //' | sed 's/ (.*//' | sort -u)

while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  if ! echo "$desired" | grep -qxF "$url"; then
    output=$(cd "$PROJECT_DIR" && npx tsx src/index.ts remove "$url" 2>&1) || true
    echo "  - $url"
    removed=$((removed + 1))
  fi
done <<< "$current"

echo ""
echo "Done: $added added, $removed removed, $skipped unchanged"
