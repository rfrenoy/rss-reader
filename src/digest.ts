import fs from "fs";
import path from "path";
import type { ArticleWithTags } from "./db";

export function generateDigest(
  date: string,
  articles: ArticleWithTags[]
): string {
  const lines: string[] = [];

  // Astro-compatible frontmatter
  lines.push("---");
  lines.push(`title: "Daily Feed — ${date}"`);
  lines.push(`date: "${date}"`);
  lines.push(
    `description: "${articles.length} article${articles.length !== 1 ? "s" : ""} from the feeds I follow."`
  );
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
