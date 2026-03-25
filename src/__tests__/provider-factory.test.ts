import { describe, it, expect } from "vitest";
import { createProvider } from "../llm";
import { AnthropicProvider } from "../llm/anthropic";
import { OllamaProvider } from "../llm/ollama";
import type { Config } from "../config";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    dataDir: "/tmp/rss-test",
    dbPath: "/tmp/rss-test/rss-reader.db",
    digestsDir: "/tmp/rss-test/digests",
    llmProvider: "ollama",
    anthropicApiKey: "",
    anthropicModel: "claude-sonnet-4-20250514",
    ollamaModel: "qwen2.5:7b",
    ollamaBaseUrl: "http://localhost:11434",
    ...overrides,
  };
}

describe("createProvider", () => {
  it("creates OllamaProvider when llmProvider is ollama", () => {
    const provider = createProvider(makeConfig({ llmProvider: "ollama" }));
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it("creates AnthropicProvider when llmProvider is anthropic with key", () => {
    const provider = createProvider(
      makeConfig({ llmProvider: "anthropic", anthropicApiKey: "sk-test" })
    );
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("throws when anthropic is selected without API key", () => {
    expect(() =>
      createProvider(makeConfig({ llmProvider: "anthropic", anthropicApiKey: "" }))
    ).toThrow("ANTHROPIC_API_KEY is required");
  });

  it("throws on unknown provider", () => {
    expect(() =>
      createProvider(makeConfig({ llmProvider: "gpt-9000" as any }))
    ).toThrow('Unknown LLM_PROVIDER: "gpt-9000"');
  });

  it("ollama does not require an API key", () => {
    const provider = createProvider(
      makeConfig({ llmProvider: "ollama", anthropicApiKey: "" })
    );
    expect(provider).toBeInstanceOf(OllamaProvider);
  });
});
