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
}

const parser = new Parser();

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchFeed(feed: Feed): Promise<FeedFetchResult> {
  const rss = await parser.parseURL(feed.url);
  const articles: FetchedArticle[] = [];

  for (const item of rss.items) {
    const guid = item.guid || item.link || item.title || "";
    const url = item.link || "";
    const title = item.title || "Untitled";
    const published_at = item.isoDate || null;

    if (!url) continue;

    let content = "";
    try {
      content = await extractArticleContent(url);
    } catch (err) {
      // Fallback to whatever the RSS feed provides
      console.warn(`    ⚠ Could not extract full article from ${url}: ${err}`);
    }

    if (!content) {
      content = item.contentSnippet || item.content || item.summary || "";
    }

    articles.push({ guid, url, title, content, published_at });
  }

  return { feedTitle: rss.title || null, articles };
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
