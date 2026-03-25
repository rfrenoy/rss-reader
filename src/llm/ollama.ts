import type { LLMProvider, ArticleSummary } from "./types";
import { buildSummarizeMessage, parseSummaryResponse } from "./shared";

export { parseSummaryResponse } from "./shared";

const DEFAULT_BASE_URL = "http://localhost:11434";

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(model: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async summarize(title: string, content: string): Promise<ArticleSummary> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "user",
            content: buildSummarizeMessage(title, content),
          },
        ],
        stream: false,
        format: "json", // Forces valid JSON output from Ollama
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return parseSummaryResponse(data.message.content);
  }
}
