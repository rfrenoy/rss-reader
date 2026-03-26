import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  initDatabase,
  addFeed,
  removeFeed,
  listFeeds,
  updateFeedTitle,
  articleExists,
  insertArticle,
  insertTags,
  insertEmbedding,
  getAllEmbeddings,
  updateNoveltyScore,
  getArticlesSince,
  recordDigest,
} from "../db";
import { serializeVector, deserializeVector } from "../embeddings";

let db: Database.Database;

beforeEach(() => {
  // In-memory database for each test
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      novelty_score REAL,
      published_at TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(feed_id, guid)
    );
    CREATE TABLE article_tags (
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (article_id, tag)
    );
    CREATE TABLE digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      filepath TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE embeddings (
      article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
      vector BLOB NOT NULL
    );
  `);
});

afterEach(() => {
  db.close();
});

// ── Feed operations ────────────────────────────────────

describe("addFeed", () => {
  it("inserts a feed and returns it", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    expect(feed.url).toBe("https://example.com/feed.xml");
    expect(feed.title).toBeNull();
    expect(feed.id).toBeGreaterThan(0);
  });

  it("stores an optional title", () => {
    const feed = addFeed(db, "https://example.com/feed.xml", "My Feed");
    expect(feed.title).toBe("My Feed");
  });

  it("rejects duplicate URLs", () => {
    addFeed(db, "https://example.com/feed.xml");
    expect(() => addFeed(db, "https://example.com/feed.xml")).toThrow();
  });
});

describe("removeFeed", () => {
  it("removes an existing feed and returns true", () => {
    addFeed(db, "https://example.com/feed.xml");
    expect(removeFeed(db, "https://example.com/feed.xml")).toBe(true);
    expect(listFeeds(db)).toHaveLength(0);
  });

  it("returns false for non-existent feed", () => {
    expect(removeFeed(db, "https://nope.com/feed.xml")).toBe(false);
  });

  it("cascades to articles and tags", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const articleId = insertArticle(db, {
      feed_id: feed.id,
      guid: "abc",
      url: "https://example.com/1",
      title: "Test",
      summary: "summary",
      published_at: null,
    });
    insertTags(db, articleId, ["rust", "wasm"]);

    removeFeed(db, "https://example.com/feed.xml");

    const articles = db
      .prepare("SELECT * FROM articles WHERE feed_id = ?")
      .all(feed.id);
    const tags = db
      .prepare("SELECT * FROM article_tags WHERE article_id = ?")
      .all(articleId);
    expect(articles).toHaveLength(0);
    expect(tags).toHaveLength(0);
  });
});

describe("listFeeds", () => {
  it("returns empty array when no feeds", () => {
    expect(listFeeds(db)).toEqual([]);
  });

  it("returns all feeds", () => {
    addFeed(db, "https://a.com/feed");
    addFeed(db, "https://b.com/feed");
    const feeds = listFeeds(db);
    expect(feeds).toHaveLength(2);
    const urls = feeds.map((f) => f.url);
    expect(urls).toContain("https://a.com/feed");
    expect(urls).toContain("https://b.com/feed");
  });
});

describe("updateFeedTitle", () => {
  it("sets title when it is null", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    updateFeedTitle(db, feed.id, "New Title");
    const updated = listFeeds(db)[0];
    expect(updated.title).toBe("New Title");
  });

  it("does not overwrite an existing title", () => {
    const feed = addFeed(db, "https://example.com/feed.xml", "Original");
    updateFeedTitle(db, feed.id, "Overwrite Attempt");
    const updated = listFeeds(db)[0];
    expect(updated.title).toBe("Original");
  });
});

// ── Article operations ─────────────────────────────────

describe("articleExists", () => {
  it("returns false when article does not exist", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    expect(articleExists(db, feed.id, "nonexistent")).toBe(false);
  });

  it("returns true after article is inserted", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    insertArticle(db, {
      feed_id: feed.id,
      guid: "abc-123",
      url: "https://example.com/1",
      title: "Test",
      summary: "summary",
      published_at: null,
    });
    expect(articleExists(db, feed.id, "abc-123")).toBe(true);
  });

  it("is scoped to feed — same GUID in different feeds is allowed", () => {
    const feed1 = addFeed(db, "https://a.com/feed");
    const feed2 = addFeed(db, "https://b.com/feed");
    insertArticle(db, {
      feed_id: feed1.id,
      guid: "shared-guid",
      url: "https://a.com/1",
      title: "A",
      summary: "s",
      published_at: null,
    });
    expect(articleExists(db, feed1.id, "shared-guid")).toBe(true);
    expect(articleExists(db, feed2.id, "shared-guid")).toBe(false);
  });
});

describe("insertArticle", () => {
  it("returns the new article ID", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "guid-1",
      url: "https://example.com/1",
      title: "Article 1",
      summary: "A summary",
      published_at: "2026-03-25T10:00:00Z",
    });
    expect(id).toBeGreaterThan(0);
  });

  it("rejects duplicate GUID within the same feed", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    insertArticle(db, {
      feed_id: feed.id,
      guid: "dup",
      url: "https://example.com/1",
      title: "First",
      summary: "s",
      published_at: null,
    });
    expect(() =>
      insertArticle(db, {
        feed_id: feed.id,
        guid: "dup",
        url: "https://example.com/2",
        title: "Second",
        summary: "s",
        published_at: null,
      })
    ).toThrow();
  });
});

describe("insertTags", () => {
  it("stores tags for an article", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "g",
      url: "https://example.com/1",
      title: "T",
      summary: "s",
      published_at: null,
    });
    insertTags(db, id, ["rust", "wasm", "performance"]);
    const tags = db
      .prepare("SELECT tag FROM article_tags WHERE article_id = ? ORDER BY tag")
      .all(id) as { tag: string }[];
    expect(tags.map((t) => t.tag)).toEqual(["performance", "rust", "wasm"]);
  });

  it("ignores duplicate tags gracefully", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "g",
      url: "https://example.com/1",
      title: "T",
      summary: "s",
      published_at: null,
    });
    insertTags(db, id, ["rust", "rust", "wasm"]);
    const tags = db
      .prepare("SELECT tag FROM article_tags WHERE article_id = ?")
      .all(id) as { tag: string }[];
    expect(tags).toHaveLength(2);
  });
});

// ── getArticlesSince ───────────────────────────────────

describe("getArticlesSince", () => {
  it("returns articles with tags and feed title", () => {
    const feed = addFeed(db, "https://example.com/feed.xml", "My Feed");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "g1",
      url: "https://example.com/1",
      title: "Article 1",
      summary: "Summary 1",
      published_at: "2026-03-25T08:00:00Z",
    });
    insertTags(db, id, ["ai", "ml"]);

    const articles = getArticlesSince(db, "2000-01-01T00:00:00");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("Article 1");
    expect(articles[0].feed_title).toBe("My Feed");
    expect(articles[0].tags).toEqual(expect.arrayContaining(["ai", "ml"]));
  });

  it("filters out articles before the cutoff", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");

    // Insert with an explicit fetched_at in the past
    db.prepare(
      `INSERT INTO articles (feed_id, guid, url, title, summary, published_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(feed.id, "old", "https://example.com/old", "Old", "s", null, "2020-01-01T00:00:00");

    insertArticle(db, {
      feed_id: feed.id,
      guid: "new",
      url: "https://example.com/new",
      title: "New",
      summary: "s",
      published_at: null,
    });

    const articles = getArticlesSince(db, "2026-01-01T00:00:00");
    expect(articles).toHaveLength(1);
    expect(articles[0].guid).toBe("new");
  });

  it("works with space-separated datetime format from SQLite", () => {
    // SQLite's datetime('now') produces "YYYY-MM-DD HH:MM:SS" (space, not T)
    const feed = addFeed(db, "https://example.com/feed.xml");
    db.prepare(
      `INSERT INTO articles (feed_id, guid, url, title, summary, published_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(feed.id, "g1", "https://example.com/1", "Article", "s", null, "2026-03-25 14:30:00");

    // Space-format cutoff should match space-format fetched_at
    const found = getArticlesSince(db, "2026-03-25 00:00:00");
    expect(found).toHaveLength(1);

    // T-format cutoff must NOT silently miss space-format rows
    const missed = getArticlesSince(db, "2026-03-25T00:00:00");
    // "2026-03-25 14:30:00" < "2026-03-25T00:00:00" because space < T in ASCII
    expect(missed).toHaveLength(0); // This is the bug we fixed in index.ts
  });

  it("returns empty tags array when article has no tags", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    insertArticle(db, {
      feed_id: feed.id,
      guid: "g",
      url: "https://example.com/1",
      title: "T",
      summary: "s",
      published_at: null,
    });
    const articles = getArticlesSince(db, "2000-01-01T00:00:00");
    expect(articles[0].tags).toEqual([]);
  });
});

// ── Embedding operations ───────────────────────────────

describe("insertEmbedding / getAllEmbeddings", () => {
  it("stores and retrieves an embedding", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "g1",
      url: "https://example.com/1",
      title: "T",
      summary: "s",
      published_at: null,
    });
    const vector = [0.1, 0.2, 0.3];
    insertEmbedding(db, id, serializeVector(vector));

    const all = getAllEmbeddings(db);
    expect(all).toHaveLength(1);
    expect(all[0].articleId).toBe(id);
    const restored = deserializeVector(all[0].vector);
    expect(restored[0]).toBeCloseTo(0.1);
    expect(restored[1]).toBeCloseTo(0.2);
    expect(restored[2]).toBeCloseTo(0.3);
  });

  it("cascades on feed delete", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "g1",
      url: "https://example.com/1",
      title: "T",
      summary: "s",
      published_at: null,
    });
    insertEmbedding(db, id, serializeVector([1, 2, 3]));
    removeFeed(db, "https://example.com/feed.xml");
    expect(getAllEmbeddings(db)).toHaveLength(0);
  });
});

describe("updateNoveltyScore", () => {
  it("sets novelty_score on an article", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id = insertArticle(db, {
      feed_id: feed.id,
      guid: "g1",
      url: "https://example.com/1",
      title: "T",
      summary: "s",
      published_at: null,
    });
    updateNoveltyScore(db, id, 0.73);
    const row = db.prepare("SELECT novelty_score FROM articles WHERE id = ?").get(id) as any;
    expect(row.novelty_score).toBeCloseTo(0.73);
  });
});

describe("getArticlesSince sorts by novelty", () => {
  it("returns most novel articles first", () => {
    const feed = addFeed(db, "https://example.com/feed.xml");
    const id1 = insertArticle(db, {
      feed_id: feed.id,
      guid: "low",
      url: "https://example.com/1",
      title: "Low Novelty",
      summary: "s",
      published_at: null,
    });
    updateNoveltyScore(db, id1, 0.2);

    const id2 = insertArticle(db, {
      feed_id: feed.id,
      guid: "high",
      url: "https://example.com/2",
      title: "High Novelty",
      summary: "s",
      published_at: null,
    });
    updateNoveltyScore(db, id2, 0.9);

    const articles = getArticlesSince(db, "2000-01-01 00:00:00");
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe("High Novelty");
    expect(articles[1].title).toBe("Low Novelty");
  });
});

// ── recordDigest ───────────────────────────────────────

describe("recordDigest", () => {
  it("inserts a digest record", () => {
    recordDigest(db, "2026-03-25", "/path/to/digest.md");
    const row = db.prepare("SELECT * FROM digests WHERE date = ?").get("2026-03-25") as any;
    expect(row.filepath).toBe("/path/to/digest.md");
  });

  it("replaces an existing digest for the same date", () => {
    recordDigest(db, "2026-03-25", "/path/v1.md");
    recordDigest(db, "2026-03-25", "/path/v2.md");
    const rows = db.prepare("SELECT * FROM digests WHERE date = ?").all("2026-03-25");
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).filepath).toBe("/path/v2.md");
  });
});
