import type { LLMProvider, ArticleSummary } from "./types";
import { buildSummarizeMessage, parseSummaryResponse } from "./shared";

export { parseSummaryResponse } from "./shared";

const DEFAULT_BASE_URL = "http://localhost:11434";

// 5 minutes total timeout
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: message }],
          // Use streaming to avoid Node's default headers timeout.
          // Ollama sends chunks immediately so headers arrive fast.
          stream: true,
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

    // Accumulate streamed NDJSON chunks into final response
    const result = await this.consumeStream(response);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const tokens = result.evalCount ? ` (${result.evalCount} tokens)` : "";
    console.log(`    [ollama] response: ${result.content.length} chars in ${elapsed}s${tokens}`);

    return parseSummaryResponse(result.content);
  }

  /**
   * Consume Ollama's streaming NDJSON response.
   * Each line is a JSON object with { message: { content: "..." }, done: bool }.
   * The final chunk (done=true) contains eval_count and other stats.
   */
  private async consumeStream(
    response: Response
  ): Promise<{ content: string; evalCount?: number }> {
    let content = "";
    let evalCount: number | undefined;

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Ollama");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (NDJSON)
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            content += chunk.message.content;
          }
          if (chunk.done && chunk.eval_count) {
            evalCount = chunk.eval_count;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.message?.content) {
          content += chunk.message.content;
        }
        if (chunk.done && chunk.eval_count) {
          evalCount = chunk.eval_count;
        }
      } catch {
        // Skip
      }
    }

    return { content, evalCount };
  }
}
