import { describe, it, expect } from "vitest";
import { generateDigest } from "../digest";
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
  it("renders empty state when no articles", () => {
    const md = generateDigest("2026-03-25", []);
    expect(md).toContain("# Feed Digest — 2026-03-25");
    expect(md).toContain("No new articles today.");
  });

  it("renders article count for single article", () => {
    const md = generateDigest("2026-03-25", [makeArticle()]);
    expect(md).toContain("*1 new article*");
    expect(md).not.toContain("articles*"); // no plural
  });

  it("renders article count plural for multiple articles", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ id: 1, guid: "a" }),
      makeArticle({ id: 2, guid: "b", title: "Second" }),
    ]);
    expect(md).toContain("*2 new articles*");
  });

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

  it("renders novelty stars and percentage", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ novelty_score: 0.75 }),
    ]);
    expect(md).toContain("★★★★☆");
    expect(md).toContain("**Novelty**: 75%");
  });

  it("omits novelty when score is null", () => {
    const md = generateDigest("2026-03-25", [
      makeArticle({ novelty_score: null }),
    ]);
    expect(md).not.toContain("★");
    expect(md).not.toContain("Novelty");
  });
});
