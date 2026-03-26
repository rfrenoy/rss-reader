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
  insertEmbedding,
  getAllEmbeddings,
  updateNoveltyScore,
  getArticlesSince,
  recordDigest,
} from "./db";
import { createProvider } from "./llm";
import {
  OllamaEmbeddingProvider,
  computeNovelty,
  deserializeVector,
  serializeVector,
} from "./embeddings";
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

    let llm;
    try {
      llm = createProvider(config);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    if (config.llmProvider === "ollama") {
      console.log(`LLM: ollama (model=${config.ollamaModel}, url=${config.ollamaBaseUrl})`);
    } else {
      console.log(`LLM: anthropic (model=${config.anthropicModel})`);
    }
    console.log(`Embeddings: ollama (model=${config.embeddingModel})`);
    console.log();

    const db = initDatabase(config.dbPath);
    const embedder = new OllamaEmbeddingProvider(
      config.embeddingModel,
      config.ollamaBaseUrl
    );
    const feeds = listFeeds(db);

    if (feeds.length === 0) {
      console.log("No feeds configured. Add one with: rss-reader add <url>");
      db.close();
      return;
    }

    // Load existing embeddings once for novelty/dedup checks
    const rawEmbeddings = getAllEmbeddings(db);
    const archive = rawEmbeddings.map((e) => ({
      articleId: e.articleId,
      vector: deserializeVector(e.vector),
    }));
    console.log(
      `Loaded ${archive.length} existing embedding${archive.length !== 1 ? "s" : ""} for novelty scoring`
    );
    console.log(
      `Fetching ${feeds.length} feed${feeds.length !== 1 ? "s" : ""}...\n`
    );

    let totalNew = 0;
    let totalDeduped = 0;

    for (const feed of feeds) {
      console.log(`→ ${feed.title || feed.url}`);

      let feedTitle: string | null = null;
      let articles: Awaited<ReturnType<typeof fetchFeed>>["articles"] = [];

      try {
        const result = await fetchFeed(feed, {
          maxAgeDays: config.maxArticleAgeDays,
          maxPerFeed: config.maxArticlesPerFeed,
        });
        feedTitle = result.feedTitle;
        articles = result.articles;
        if (result.skippedOld > 0) {
          console.log(`  skipped ${result.skippedOld} article${result.skippedOld !== 1 ? "s" : ""} older than ${config.maxArticleAgeDays} days`);
        }
        if (result.skippedCap > 0) {
          console.log(`  capped: ${result.skippedCap} extra article${result.skippedCap !== 1 ? "s" : ""} beyond limit of ${config.maxArticlesPerFeed}`);
        }
      } catch (err) {
        console.error(`  ✗ Failed to fetch: ${err}`);
        continue;
      }

      if (feedTitle) {
        updateFeedTitle(db, feed.id, feedTitle);
      }

      let newCount = 0;

      for (const article of articles) {
        if (articleExists(db, feed.id, article.guid)) continue;

        console.log(`  new: ${article.title}`);
        console.log(`    content: ${article.content.length} chars`);

        // ── Embed & check for duplicates ───────────────
        let embedding: number[] | null = null;
        let noveltyScore: number | null = null;

        try {
          const textToEmbed = `${article.title}\n\n${article.content}`;
          embedding = await embedder.embed(textToEmbed);

          const novelty = computeNovelty(embedding, archive);
          noveltyScore = novelty.score;

          console.log(
            `    novelty: ${Math.round(noveltyScore * 100)}% (max sim: ${novelty.maxSimilarity.toFixed(2)})`
          );

          // Dedup: skip articles too similar to existing ones
          if (novelty.maxSimilarity >= config.dedupeThreshold) {
            console.log(
              `    ⊘ duplicate (similarity ${(novelty.maxSimilarity * 100).toFixed(0)}% ≥ ${(config.dedupeThreshold * 100).toFixed(0)}% threshold), skipping`
            );
            totalDeduped++;
            continue;
          }
        } catch (err: any) {
          console.warn(`    ⚠ Embedding failed: ${err.message} — continuing without novelty score`);
        }

        // ── Summarize ──────────────────────────────────
        let summary = "No summary available.";
        let tags: string[] = [];
        try {
          const result = await summarizeArticle(llm, article);
          summary = result.summary;
          tags = result.tags;
          console.log(`    tags: [${tags.join(", ")}]`);
        } catch (err: any) {
          const cause = err.cause ? `\n    cause: ${err.cause.message ?? err.cause}` : "";
          console.error(`  ⚠ Summary failed: ${err.message}${cause}`);
        }

        // ── Store ──────────────────────────────────────
        const articleId = insertArticle(db, {
          feed_id: feed.id,
          guid: article.guid,
          url: article.url,
          title: article.title,
          summary,
          published_at: article.published_at,
        });

        if (noveltyScore != null) {
          updateNoveltyScore(db, articleId, noveltyScore);
        }

        if (embedding) {
          insertEmbedding(db, articleId, serializeVector(embedding));
          // Add to in-memory archive so subsequent articles in the same
          // batch are compared against this one too
          archive.push({ articleId, vector: embedding });
        }

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
    // Use space separator to match SQLite's datetime() format
    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today} 00:00:00`;
    const digestArticles = getArticlesSince(db, todayStart);

    const markdown = generateDigest(today, digestArticles);
    const filepath = writeDigest(config.digestsDir, today, markdown);
    recordDigest(db, today, filepath);

    console.log(`✓ Digest: ${filepath}`);
    console.log(
      `  ${totalNew} new article${totalNew !== 1 ? "s" : ""} processed`
    );
    if (totalDeduped > 0) {
      console.log(
        `  ${totalDeduped} duplicate${totalDeduped !== 1 ? "s" : ""} skipped`
      );
    }

    db.close();
  });

program.parse();
