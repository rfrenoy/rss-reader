# RSS Reader

AI-assisted RSS reader that generates daily markdown digests with article summaries and tags.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Usage

### Manage feeds

```bash
npm run rss -- add https://example.com/feed.xml
npm run rss -- remove https://example.com/feed.xml
npm run rss -- list
```

### Generate a digest

```bash
npm run digest
```

This fetches all feeds, identifies new articles (GUID-based dedup), extracts full
article content, generates a summary and tags via Claude, and writes a dated
markdown file to `~/.rss-reader/digests/YYYY-MM-DD.md`.

### CRON (daily at 7am)

```bash
0 7 * * * cd /path/to/rss-reader && npm run digest >> /tmp/rss-reader.log 2>&1
```

## Configuration

All via environment variables (or `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | *(required)* | Anthropic API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Model for summaries |
| `RSS_DATA_DIR` | `~/.rss-reader` | Database and data directory |
| `RSS_DIGESTS_DIR` | `~/.rss-reader/digests` | Digest output directory |

## Architecture

```
src/
├── index.ts          CLI entry point (commander)
├── config.ts         Environment-based configuration
├── db.ts             SQLite schema & queries (better-sqlite3)
├── fetcher.ts        RSS parsing + full article extraction
├── summarizer.ts     Orchestrates LLM summarization
├── digest.ts         Markdown digest generation
└── llm/
    ├── types.ts      LLMProvider interface (abstraction layer)
    └── anthropic.ts  Anthropic/Claude implementation
```

## Data

Stored in `~/.rss-reader/`:

- `rss-reader.db` — SQLite database (feeds, articles, tags, digests)
- `digests/` — Generated markdown files
