import path from "path";
import os from "os";

export interface Config {
  dataDir: string;
  dbPath: string;
  digestsDir: string;
  anthropicApiKey: string;
  anthropicModel: string;
}

export function loadConfig(): Config {
  const dataDir =
    process.env.RSS_DATA_DIR || path.join(os.homedir(), ".rss-reader");
  return {
    dataDir,
    dbPath: path.join(dataDir, "rss-reader.db"),
    digestsDir:
      process.env.RSS_DIGESTS_DIR || path.join(dataDir, "digests"),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  };
}
