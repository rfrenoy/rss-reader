import fs from "fs";
import path from "path";
import type { ArticleWithTags } from "./db";

export function generateDigest(
  date: string,
  articles: ArticleWithTags[]
): string {
  if (articles.length === 0) {
    return `# Feed Digest — ${date}\n\nNo new articles today.\n`;
  }

  const lines: string[] = [
    `# Feed Digest — ${date}`,
    "",
    `*${articles.length} new article${articles.length !== 1 ? "s" : ""}*`,
    "",
    "---",
    "",
  ];

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
  const filepath = path.join(digestsDir, `${date}.md`);
  fs.writeFileSync(filepath, content, "utf-8");
  return filepath;
}
