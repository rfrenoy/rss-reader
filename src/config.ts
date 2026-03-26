import path from "path";
import os from "os";

export type LLMProviderType = "ollama" | "anthropic";

export interface Config {
  dataDir: string;
  dbPath: string;
  digestsDir: string;

  llmProvider: LLMProviderType;

  // Anthropic
  anthropicApiKey: string;
  anthropicModel: string;

  // Ollama
  ollamaModel: string;
  ollamaBaseUrl: string;

  // Fetch limits
  maxArticleAgeDays: number;
  maxArticlesPerFeed: number;

  // Embeddings
  embeddingModel: string;
  dedupeThreshold: number; // similarity above this → duplicate, skip
}

function resolveProvider(): LLMProviderType {
  const explicit = process.env.LLM_PROVIDER;
  if (explicit) return explicit as LLMProviderType;

  // Auto-detect: if an Anthropic key is set, use Anthropic; otherwise default to Ollama
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "ollama";
}

export function loadConfig(): Config {
  const dataDir =
    process.env.RSS_DATA_DIR || path.join(os.homedir(), ".rss-reader");
  return {
    dataDir,
    dbPath: path.join(dataDir, "rss-reader.db"),
    digestsDir:
      process.env.RSS_DIGESTS_DIR || path.join(dataDir, "digests"),

    llmProvider: resolveProvider(),

    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",

    ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:7b",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",

    maxArticleAgeDays: parseInt(process.env.MAX_ARTICLE_AGE_DAYS || "7", 10),
    maxArticlesPerFeed: parseInt(process.env.MAX_ARTICLES_PER_FEED || "20", 10),

    embeddingModel: process.env.EMBEDDING_MODEL || "nomic-embed-text",
    dedupeThreshold: parseFloat(process.env.DEDUPE_THRESHOLD || "0.85"),
  };
}
