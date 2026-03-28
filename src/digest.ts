import fs from "fs";
import path from "path";
import type { ArticleWithTags } from "./db";

/**
 * Format a list of items as "A, B, and C" or "A, B, and N others".
 */
function formatList(items: string[], max: number): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length <= max) {
    return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
  }
  const shown = items.slice(0, max);
  const remaining = items.length - max;
  return shown.join(", ") + ` and ${remaining} other${remaining !== 1 ? "s" : ""}`;
}

/**
 * Build a description like:
 * "5 articles from Blog A, Blog B, and 2 others, covering rust, ai, and web."
 */
export function buildDescription(articles: ArticleWithTags[]): string {
  const count = articles.length;
  if (count === 0) return "No new articles today.";

  const articleWord = count === 1 ? "article" : "articles";

  // Unique sources, preserving order of appearance
  const sources = [
    ...new Map(
      articles
        .filter((a) => a.feed_title)
        .map((a) => [a.feed_title!, a.feed_title!])
    ).values(),
  ];

  // Top tags by frequency
  const tagCounts = new Map<string, number>();
  for (const a of articles) {
    for (const t of a.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  let desc = `${count} ${articleWord}`;

  if (sources.length > 0) {
    desc += ` from ${formatList(sources, 3)}`;
  }

  if (topTags.length > 0) {
    desc += `, covering ${formatList(topTags.slice(0, 4), 4)}`;
  }

  return desc + ".";
}

export function generateDigest(
  date: string,
  articles: ArticleWithTags[]
): string {
  const lines: string[] = [];

  // Astro-compatible frontmatter
  const description = buildDescription(articles);
  lines.push("---");
  lines.push(`title: "Daily Feed — ${date}"`);
  lines.push(`date: "${date}"`);
  lines.push(`description: "${description}"`);
  lines.push(`series: "Daily Feed"`);
  lines.push("---");
  lines.push("");

  if (articles.length === 0) {
    lines.push("No new articles today.");
    return lines.join("\n") + "\n";
  }

  for (const article of articles) {
    lines.push(`## [${article.title}](${article.url})`);
    lines.push("");

    const meta: string[] = [];
    if (article.feed_title) meta.push(`**Source**: ${article.feed_title}`);
    if (article.tags.length > 0)
      meta.push(
        `**Tags**: ${article.tags.map((t) => `\`${t}\``).join(", ")}`
      );
    if (article.published_at)
      meta.push(`**Published**: ${article.published_at.split("T")[0]}`);
    if (article.novelty_score != null)
      meta.push(
        `**Novelty**: ${Math.round(article.novelty_score * 100)}%`
      );

    if (meta.length > 0) {
      lines.push(meta.join(" | "));
      lines.push("");
    }

    lines.push(article.summary || "No summary available.");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function writeDigest(
  digestsDir: string,
  date: string,
  content: string
): string {
  fs.mkdirSync(digestsDir, { recursive: true });
  const filepath = path.join(digestsDir, `daily-feed-${date}.md`);
  fs.writeFileSync(filepath, content, "utf-8");
  return filepath;
}
