import fs from "fs";
import path from "path";
import type { ArticleWithTags } from "./db";

/**
 * Escape characters that have special meaning in HTML, so user-provided
 * data (feed titles, article titles, LLM summaries) is rendered as text
 * rather than being eaten by the markdown/HTML parser. `&` is replaced
 * first to avoid double-escaping the entities we add below.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape a string for inclusion in a YAML double-quoted scalar
 * (the frontmatter `description`). Collapses whitespace to a single
 * line since frontmatter fields are single-line.
 */
function escapeYamlDoubleQuoted(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Feed titles used in the frontmatter description: collapse whitespace
 * so a stray newline can't break the YAML scalar. Don't HTML-escape —
 * the description is plain text and we want it to read naturally
 * (e.g. `<antirez>` shown as `<antirez>`, not `&lt;antirez&gt;`).
 */
function normalizeFeedTitleForDescription(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Feed titles used inline in the markdown body (the `**Source**: …` meta
 * line): collapse whitespace and HTML-escape the result so a stray tag
 * like `<antirez>` from an RSS channel title doesn't disappear in render.
 */
function sanitizeFeedTitle(s: string): string {
  return escapeHtml(s.replace(/\s+/g, " ").trim());
}

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

  // Unique sources, preserving order of appearance. Normalize so a
  // feed title with a stray newline can't break the YAML scalar.
  const sources = [
    ...new Map(
      articles
        .filter((a) => a.feed_title)
        .map((a) => [
          a.feed_title!,
          normalizeFeedTitleForDescription(a.feed_title!),
        ])
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
  const description = escapeYamlDoubleQuoted(buildDescription(articles));
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
    lines.push(`## [${escapeHtml(article.title)}](${article.url})`);
    lines.push("");

    const meta: string[] = [];
    if (article.feed_title)
      meta.push(`**Source**: ${sanitizeFeedTitle(article.feed_title)}`);
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

    lines.push(article.summary ? escapeHtml(article.summary) : "No summary available.");
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
