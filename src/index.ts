import { Command } from "commander";
import { loadConfig } from "./config";
import {
  initDatabase,
  addFeed,
  removeFeed,
  listFeeds,
  updateFeedTitle,
  articleExists,
  insertArticle,
  insertTags,
  getArticlesSince,
  recordDigest,
} from "./db";
import { AnthropicProvider } from "./llm/anthropic";
import { fetchFeed } from "./fetcher";
import { summarizeArticle } from "./summarizer";
import { generateDigest, writeDigest } from "./digest";

const program = new Command();
program
  .name("rss-reader")
  .description("AI-assisted RSS reader with daily digests")
  .version("0.1.0");

// ── add ────────────────────────────────────────────────

program
  .command("add")
  .description("Add an RSS feed")
  .argument("<url>", "Feed URL")
  .action((url: string) => {
    const config = loadConfig();
    const db = initDatabase(config.dbPath);
    try {
      const feed = addFeed(db, url);
      console.log(`✓ Added feed: ${feed.url}`);
    } catch (err: any) {
      if (err.message?.includes("UNIQUE")) {
        console.error("Feed already exists.");
      } else {
        console.error(`Error: ${err.message}`);
      }
    } finally {
      db.close();
    }
  });

// ── remove ─────────────────────────────────────────────

program
  .command("remove")
  .description("Remove an RSS feed")
  .argument("<url>", "Feed URL")
  .action((url: string) => {
    const config = loadConfig();
    const db = initDatabase(config.dbPath);
    const removed = removeFeed(db, url);
    if (removed) {
      console.log(`✓ Removed feed: ${url}`);
    } else {
      console.error(`Feed not found: ${url}`);
    }
    db.close();
  });

// ── list ───────────────────────────────────────────────

program
  .command("list")
  .description("List all feeds")
  .action(() => {
    const config = loadConfig();
    const db = initDatabase(config.dbPath);
    const feeds = listFeeds(db);
    if (feeds.length === 0) {
      console.log("No feeds configured. Add one with: rss-reader add <url>");
    } else {
      console.log(
        `\n${feeds.length} feed${feeds.length !== 1 ? "s" : ""}:\n`
      );
      for (const feed of feeds) {
        console.log(
          `  • ${feed.url}${feed.title ? ` (${feed.title})` : ""}`
        );
      }
      console.log();
    }
    db.close();
  });

// ── digest ─────────────────────────────────────────────

program
  .command("digest")
  .description("Fetch new articles and generate today's digest")
  .action(async () => {
    const config = loadConfig();

    if (!config.anthropicApiKey) {
      console.error(
        "Error: ANTHROPIC_API_KEY environment variable is required."
      );
      process.exit(1);
    }

    const db = initDatabase(config.dbPath);
    const llm = new AnthropicProvider(
      config.anthropicApiKey,
      config.anthropicModel
    );
    const feeds = listFeeds(db);

    if (feeds.length === 0) {
      console.log("No feeds configured. Add one with: rss-reader add <url>");
      db.close();
      return;
    }

    console.log(
      `Fetching ${feeds.length} feed${feeds.length !== 1 ? "s" : ""}...\n`
    );

    let totalNew = 0;

    for (const feed of feeds) {
      console.log(`→ ${feed.title || feed.url}`);

      let feedTitle: string | null = null;
      let articles: Awaited<ReturnType<typeof fetchFeed>>["articles"] = [];

      try {
        const result = await fetchFeed(feed);
        feedTitle = result.feedTitle;
        articles = result.articles;
      } catch (err) {
        console.error(`  ✗ Failed to fetch: ${err}`);
        continue;
      }

      // Persist feed title from the RSS metadata if we don't have one yet
      if (feedTitle) {
        updateFeedTitle(db, feed.id, feedTitle);
      }

      let newCount = 0;

      for (const article of articles) {
        if (articleExists(db, feed.id, article.guid)) continue;

        console.log(`  new: ${article.title}`);

        let summary = "No summary available.";
        let tags: string[] = [];
        try {
          const result = await summarizeArticle(llm, article);
          summary = result.summary;
          tags = result.tags;
        } catch (err) {
          console.error(`  ⚠ Summary failed: ${err}`);
        }

        const articleId = insertArticle(db, {
          feed_id: feed.id,
          guid: article.guid,
          url: article.url,
          title: article.title,
          summary,
          published_at: article.published_at,
        });

        if (tags.length > 0) {
          insertTags(db, articleId, tags);
        }

        newCount++;
        totalNew++;
      }

      console.log(
        `  ${newCount} new article${newCount !== 1 ? "s" : ""}\n`
      );
    }

    // Generate digest from everything fetched today
    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00`;
    const digestArticles = getArticlesSince(db, todayStart);

    const markdown = generateDigest(today, digestArticles);
    const filepath = writeDigest(config.digestsDir, today, markdown);
    recordDigest(db, today, filepath);

    console.log(`✓ Digest: ${filepath}`);
    console.log(
      `  ${totalNew} new article${totalNew !== 1 ? "s" : ""} processed`
    );

    db.close();
  });

program.parse();
