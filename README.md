# RSS Reader

AI-assisted RSS reader that generates daily markdown digests with article summaries, tags, and interestingness ratings.

## Setup

```bash
npm install
```

### Option A: Ollama (default — free, local)

```bash
# Install Ollama: https://ollama.com
ollama pull qwen2.5:7b          # summarization
ollama pull nomic-embed-text     # embeddings (novelty scoring & dedup)
```

No API key needed. The reader defaults to Ollama when no `ANTHROPIC_API_KEY` is set.

### Option B: Anthropic API

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Ollama is still used for embeddings regardless of LLM provider.

## Usage

### Manage feeds

Add feeds one by one:

```bash
npm run rss -- add https://example.com/feed.xml
npm run rss -- remove https://example.com/feed.xml
npm run rss -- list
```

Or bulk-import from a file (one URL per line, `#` comments and blank lines are skipped):

```bash
npm run sync-feeds                         # reads FEED.md in project root
npm run sync-feeds -- /path/to/feeds.txt   # custom file
```

### Generate a digest

```bash
npm run digest
```

The digest pipeline:

1. **Fetch** all feeds and parse new articles (GUID-based dedup)
2. **Extract** full article content via Readability
3. **Embed** each article for novelty scoring and deduplication
4. **Deduplicate** — skip articles too similar to existing ones (cosine similarity ≥ 85%)
5. **Summarize** each article and generate tags via LLM
6. **Output** a markdown digest to `~/.rss-reader/digests/YYYY-MM-DD.md`, sorted by novelty

Example output:

```markdown
## [Article Title](https://example.com/article) ★★★★☆

**Source**: Blog Name | **Tags**: `ai`, `rust` | **Published**: 2026-03-25 | **Novelty**: 75%

This article introduces a novel approach to...
```

### CRON (daily at 7am)

```bash
0 7 * * * cd /path/to/rss-reader && npm run digest >> /tmp/rss-reader.log 2>&1
```

### Reset

To start fresh, delete the database:

```bash
rm ~/.rss-reader/rss-reader.db
```

## Configuration

All via environment variables (or `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | *auto* | `ollama` or `anthropic`. Auto-detected if not set. |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Ollama model for summaries |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (triggers auto-detect) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Anthropic model for summaries |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama model for embeddings |
| `DEDUPE_THRESHOLD` | `0.85` | Similarity above this → duplicate, skip |
| `MAX_ARTICLE_AGE_DAYS` | `7` | Skip articles older than N days |
| `MAX_ARTICLES_PER_FEED` | `20` | Max articles to process per feed |
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
├── embeddings.ts     Ollama embeddings, cosine similarity, novelty scoring
└── llm/
    ├── types.ts      LLMProvider interface (abstraction layer)
    ├── shared.ts     Prompt template + response parsing
    ├── index.ts      Provider factory
    ├── anthropic.ts  Anthropic/Claude implementation
    └── ollama.ts     Ollama implementation (local models)
scripts/
└── sync-feeds.sh     Bulk-import feeds from a text file
```

## Data

Stored in `~/.rss-reader/`:

- `rss-reader.db` — SQLite database (feeds, articles, tags, embeddings, digests)
- `digests/` — Generated markdown files
