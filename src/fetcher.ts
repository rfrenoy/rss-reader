import Parser from "rss-parser";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import type { Feed } from "./db";

export interface FetchedArticle {
  guid: string;
  url: string;
  title: string;
  content: string;
  published_at: string | null;
}

export interface FeedFetchResult {
  feedTitle: string | null;
  articles: FetchedArticle[];
  skippedOld: number;
  skippedCap: number;
}

export interface FetchOptions {
  /** Only include articles newer than this many days. 0 = no limit. */
  maxAgeDays?: number;
  /** Max articles to process per feed. 0 = no limit. */
  maxPerFeed?: number;
}

const parser = new Parser();

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchFeed(
  feed: Feed,
  options: FetchOptions = {}
): Promise<FeedFetchResult> {
  const { maxAgeDays = 0, maxPerFeed = 0 } = options;
  const rss = await parser.parseURL(feed.url);
  const articles: FetchedArticle[] = [];

  const cutoff = maxAgeDays > 0
    ? new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
    : null;

  let skippedOld = 0;
  let skippedCap = 0;

  for (const item of rss.items) {
    const guid = item.guid || item.link || item.title || "";
    const url = item.link || "";
    const title = item.title || "Untitled";
    const published_at = item.isoDate || null;

    if (!url) continue;

    // Skip articles older than cutoff
    if (cutoff && published_at) {
      const pubDate = new Date(published_at);
      if (pubDate < cutoff) {
        skippedOld++;
        continue;
      }
    }

    // Enforce per-feed cap
    if (maxPerFeed > 0 && articles.length >= maxPerFeed) {
      skippedCap++;
      continue;
    }

    let content = "";
    try {
      content = await extractArticleContent(url);
    } catch (err) {
      console.warn(`    ⚠ Could not extract full article from ${url}: ${err}`);
    }

    if (!content) {
      content = item.contentSnippet || item.content || item.summary || "";
    }

    articles.push({ guid, url, title, content, published_at });
  }

  return { feedTitle: rss.title || null, articles, skippedOld, skippedCap };
}

/**
 * Extract readable text content from an HTML string.
 * Exported for testability.
 */
export function extractContentFromHtml(html: string): string {
  if (!html.trim()) return "";
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document as any);
    const article = reader.parse();
    return article?.textContent?.trim() || "";
  } catch {
    return "";
  }
}

async function extractArticleContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RSS-Reader/1.0)",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return extractContentFromHtml(html);
}
