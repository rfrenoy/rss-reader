import type { LLMProvider } from "./types";
import type { Config } from "../config";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";

export type { LLMProvider, ArticleSummary } from "./types";

/**
 * Create an LLM provider based on configuration.
 * Validates that required settings are present and throws a clear error if not.
 */
export function createProvider(config: Config): LLMProvider {
  switch (config.llmProvider) {
    case "anthropic": {
      if (!config.anthropicApiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic"
        );
      }
      return new AnthropicProvider(config.anthropicApiKey, config.anthropicModel);
    }

    case "ollama": {
      return new OllamaProvider(config.ollamaModel, config.ollamaBaseUrl);
    }

    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${config.llmProvider}". Use "ollama" or "anthropic".`
      );
  }
}
