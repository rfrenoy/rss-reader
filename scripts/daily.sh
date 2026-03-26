#!/usr/bin/env bash
# Daily pipeline: sync feeds, generate digest, copy to blog.
# Intended for cron. Logs to stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BLOG_CONTENT_DIR="${BLOG_DIR:+$BLOG_DIR/src/content/daily-feed}"

cd "$PROJECT_DIR"

echo "=== $(date) ==="

# 1. Sync feeds from FEED.md
echo "→ Syncing feeds..."
bash scripts/sync-feeds.sh

# 2. Generate digest
echo "→ Generating digest..."
if [ -n "$BLOG_CONTENT_DIR" ]; then
  RSS_DIGESTS_DIR="$BLOG_CONTENT_DIR" npm run digest --silent
else
  npm run digest --silent
fi

# 3. Commit and push blog (if BLOG_DIR is set and there are changes)
if [ -n "${BLOG_DIR:-}" ]; then
  cd "$BLOG_DIR"
  if git diff --quiet && git diff --cached --quiet; then
    echo "→ No changes to publish"
  else
    TODAY=$(date +%Y-%m-%d)
    git add -A
    git commit -m "Daily Feed — $TODAY"
    git push
    echo "→ Published to blog"
  fi
else
  echo "→ BLOG_DIR not set, skipping publish"
fi

echo "=== Done ==="
