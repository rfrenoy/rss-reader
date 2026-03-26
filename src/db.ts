import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────

export interface Feed {
  id: number;
  url: string;
  title: string | null;
  added_at: string;
}

export interface Article {
  id: number;
  feed_id: number;
  guid: string;
  url: string;
  title: string;
  summary: string | null;
  novelty_score: number | null;
  published_at: string | null;
  fetched_at: string;
}

export interface ArticleWithTags extends Article {
  tags: string[];
  feed_title: string | null;
}

// ── Initialization ─────────────────────────────────────

export function initDatabase(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(feed_id, guid)
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (article_id, tag)
    );

    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      filepath TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
      vector BLOB NOT NULL
    );
  `);

  // Migrate: add novelty_score column if missing (for existing DBs)
  try {
    db.exec(`ALTER TABLE articles ADD COLUMN novelty_score REAL`);
  } catch {
    // Column already exists — ignore
  }

  return db;
}

// ── Feed operations ────────────────────────────────────

export function addFeed(
  db: Database.Database,
  url: string,
  title?: string
): Feed {
  db.prepare("INSERT INTO feeds (url, title) VALUES (?, ?)").run(
    url,
    title || null
  );
  return db.prepare("SELECT * FROM feeds WHERE url = ?").get(url) as Feed;
}

export function removeFeed(db: Database.Database, url: string): boolean {
  return db.prepare("DELETE FROM feeds WHERE url = ?").run(url).changes > 0;
}

export function listFeeds(db: Database.Database): Feed[] {
  return db
    .prepare("SELECT * FROM feeds ORDER BY added_at DESC")
    .all() as Feed[];
}

export function updateFeedTitle(
  db: Database.Database,
  feedId: number,
  title: string
): void {
  db.prepare("UPDATE feeds SET title = ? WHERE id = ? AND title IS NULL").run(
    title,
    feedId
  );
}

// ── Article operations ─────────────────────────────────

export function articleExists(
  db: Database.Database,
  feedId: number,
  guid: string
): boolean {
  return !!db
    .prepare("SELECT 1 FROM articles WHERE feed_id = ? AND guid = ?")
    .get(feedId, guid);
}

export function insertArticle(
  db: Database.Database,
  article: {
    feed_id: number;
    guid: string;
    url: string;
    title: string;
    summary: string;
    published_at: string | null;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO articles (feed_id, guid, url, title, summary, published_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      article.feed_id,
      article.guid,
      article.url,
      article.title,
      article.summary,
      article.published_at
    );
  return Number(result.lastInsertRowid);
}

export function insertTags(
  db: Database.Database,
  articleId: number,
  tags: string[]
): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO article_tags (article_id, tag) VALUES (?, ?)"
  );
  for (const tag of tags) {
    stmt.run(articleId, tag);
  }
}

export function getArticlesSince(
  db: Database.Database,
  since: string
): ArticleWithTags[] {
  const articles = db
    .prepare(
      `SELECT a.*, f.title AS feed_title
       FROM articles a
       JOIN feeds f ON a.feed_id = f.id
       WHERE a.fetched_at >= ?
       ORDER BY a.novelty_score DESC, a.published_at DESC, a.fetched_at DESC`
    )
    .all(since) as (Article & { feed_title: string | null })[];

  return articles.map((article) => {
    const tags = db
      .prepare("SELECT tag FROM article_tags WHERE article_id = ?")
      .all(article.id) as { tag: string }[];
    return { ...article, tags: tags.map((t) => t.tag) };
  });
}

// ── Embedding operations ───────────────────────────────

export function insertEmbedding(
  db: Database.Database,
  articleId: number,
  vector: Buffer
): void {
  db.prepare(
    "INSERT OR REPLACE INTO embeddings (article_id, vector) VALUES (?, ?)"
  ).run(articleId, vector);
}

export function getAllEmbeddings(
  db: Database.Database
): { articleId: number; vector: Buffer }[] {
  return db
    .prepare("SELECT article_id AS articleId, vector FROM embeddings")
    .all() as { articleId: number; vector: Buffer }[];
}

export function updateNoveltyScore(
  db: Database.Database,
  articleId: number,
  score: number
): void {
  db.prepare("UPDATE articles SET novelty_score = ? WHERE id = ?").run(
    score,
    articleId
  );
}

// ── Digest operations ──────────────────────────────────

export function recordDigest(
  db: Database.Database,
  date: string,
  filepath: string
): void {
  db.prepare(
    "INSERT OR REPLACE INTO digests (date, filepath) VALUES (?, ?)"
  ).run(date, filepath);
}
