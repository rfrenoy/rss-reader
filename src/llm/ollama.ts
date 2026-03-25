import { Agent } from "http";
import type { LLMProvider, ArticleSummary } from "./types";
import { buildSummarizeMessage, parseSummaryResponse } from "./shared";

export { parseSummaryResponse } from "./shared";

const DEFAULT_BASE_URL = "http://localhost:11434";

// 5 minutes — a 32B model on a long article with stream:false can take a while
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

// Custom agent with generous timeouts to avoid Node's default headers timeout
const agent = new Agent({
  keepAlive: true,
  timeout: REQUEST_TIMEOUT_MS,
});

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  total_duration?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(model: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async summarize(title: string, content: string): Promise<ArticleSummary> {
    const url = `${this.baseUrl}/api/chat`;
    const message = buildSummarizeMessage(title, content);

    console.log(`    [ollama] POST ${url}`);
    console.log(`    [ollama] model=${this.model}  input=${message.length} chars`);

    const start = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // @ts-expect-error — Node's fetch supports dispatcher for custom agent
        dispatcher: agent,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: message }],
          stream: false,
          format: "json",
        }),
      });
    } catch (err: any) {
      const cause = err.cause ? ` (cause: ${err.cause.message ?? err.cause})` : "";
      throw new Error(`Ollama connection failed: ${err.message}${cause}`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama HTTP ${response.status}: ${body}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const tokens = data.eval_count ? ` (${data.eval_count} tokens)` : "";
    console.log(`    [ollama] response: ${data.message.content.length} chars in ${elapsed}s${tokens}`);

    return parseSummaryResponse(data.message.content);
  }
}
