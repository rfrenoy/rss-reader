import { describe, it, expect } from "vitest";
import { generateDigest, buildDescription } from "../digest";
import type { ArticleWithTags } from "../db";

function makeArticle(overrides: Partial<ArticleWithTags> = {}): ArticleWithTags {
  return {
    id: 1,
    feed_id: 1,
    guid: "guid-1",
    url: "https://example.com/article",
    title: "Test Article",
    summary: "This is a test summary.",
    novelty_score: 0.75,
    published_at: "2026-03-25T10:00:00Z",
    fetched_at: "2026-03-25T12:00:00Z",
    tags: ["ai", "testing"],
    feed_title: "Example Feed",
    ...overrides,
  };
}

describe("generateDigest", () => {
  // ── Frontmatter ────────────────────────────────────

  it("includes Astro-compatible frontmatter", () => {
    const md = generateDigest("2026-03-25", [makeArticle()]);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('title: "Daily Feed — 2026-03-25"');
    expect(md).toContain('date: "2026-03-25"');
    expect(md).toContain('series: "Daily Feed"');
  });

  it("includes sources and topics in description", () => {
    const md = generateDigest("2026-03-25", [makeArticle()]);
    expect(md).toContain("1 article from Example Feed");
    expect(md).toContain("covering ai and testing");
  });

  // ── Empty state ────────────────────────────────────

  it("renders empty state with frontmatter", () => {
    const md = generateDigest("2026-03-25", []);
    expect(md).toContain('title: "Daily Feed — 2026-03-25"');
    expect(md).toContain("No new articles today.");
  });

  // ── Article rendering ──────────────────────────────

  it("renders title as a link", () => {
    const md = generateDigest("2026-03-25", [makeArticle()]);
    expect(md).toContain("## [Test Article](https://example.com/article)");
  });

  it("renders source, tags, and published date", () => {
    const md = generateDigest("2026-03-25", [makeArticle()]);
    expect(md).toContain("**Source**: Example Feed");
    expect(md).toContain("`ai`");
    expect(md).toContain("`testing`");
    expect(md).toContain("**Published**: 2026-03-25");
  });

  it("renders summary text", () => {
    const md = generateDigest("2026-03-25", [makeArticle()]);
    expect(md).toContain("This is a test summary.");
  });

  it("handles missing feed title", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ feed_title: null }),
    ]);
    expect(md).not.toContain("**Source**");
  });

  it("handles empty tags", () => {
    const md = generateDigest("2026-03-25", [makeArticle({ tags: [] })]);
    expect(md).not.toContain("**Tags**");
  });

  it("handles missing published_at", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ published_at: null }),
    ]);
    expect(md).not.toContain("**Published**");
  });

  it("handles null summary with fallback text", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ summary: null }),
    ]);
    expect(md).toContain("No summary available.");
  });

  // ── Novelty ────────────────────────────────────────

  it("renders novelty percentage", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ novelty_score: 0.75 }),
    ]);
    expect(md).toContain("**Novelty**: 75%");
    expect(md).not.toContain("★");
  });

  it("omits novelty when score is null", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ novelty_score: null }),
    ]);
    expect(md).not.toContain("Novelty");
  });
});

// ── buildDescription ─────────────────────────────────

describe("buildDescription", () => {
  it("handles empty articles", () => {
    expect(buildDescription([])).toBe("No new articles today.");
  });

  it("handles single article with source and tags", () => {
    const desc = buildDescription([makeArticle()]);
    expect(desc).toBe(
      "1 article from Example Feed, covering ai and testing."
    );
  });

  it("lists multiple sources", () => {
    const desc = buildDescription([
      makeArticle({ feed_title: "Blog A", tags: ["rust"] }),
      makeArticle({ id: 2, guid: "b", feed_title: "Blog B", tags: ["ai"] }),
    ]);
    expect(desc).toBe(
      "2 articles from Blog A and Blog B, covering rust and ai."
    );
  });

  it("caps sources at 3 and shows others count", () => {
    const desc = buildDescription([
      makeArticle({ id: 1, guid: "a", feed_title: "A", tags: [] }),
      makeArticle({ id: 2, guid: "b", feed_title: "B", tags: [] }),
      makeArticle({ id: 3, guid: "c", feed_title: "C", tags: [] }),
      makeArticle({ id: 4, guid: "d", feed_title: "D", tags: [] }),
      makeArticle({ id: 5, guid: "e", feed_title: "E", tags: [] }),
    ]);
    expect(desc).toBe("5 articles from A, B, C and 2 others.");
  });

  it("deduplicates sources", () => {
    const desc = buildDescription([
      makeArticle({ id: 1, guid: "a", feed_title: "Same Blog", tags: [] }),
      makeArticle({ id: 2, guid: "b", feed_title: "Same Blog", tags: [] }),
    ]);
    expect(desc).toBe("2 articles from Same Blog.");
  });

  it("sorts tags by frequency", () => {
    const desc = buildDescription([
      makeArticle({ id: 1, guid: "a", feed_title: null, tags: ["ai", "rust"] }),
      makeArticle({ id: 2, guid: "b", feed_title: null, tags: ["ai", "web"] }),
      makeArticle({ id: 3, guid: "c", feed_title: null, tags: ["ai"] }),
    ]);
    // ai appears 3x, rust 1x, web 1x → ai first
    expect(desc).toMatch(/^3 articles, covering ai/);
  });

  it("omits sources when all are null", () => {
    const desc = buildDescription([
      makeArticle({ feed_title: null, tags: ["rust"] }),
    ]);
    expect(desc).toBe("1 article, covering rust.");
  });

  it("omits topics when no tags", () => {
    const desc = buildDescription([
      makeArticle({ feed_title: "Blog", tags: [] }),
    ]);
    expect(desc).toBe("1 article from Blog.");
  });
});
