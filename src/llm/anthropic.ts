import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ArticleSummary } from "./types";

export const SUMMARIZE_PROMPT = `You are an expert content analyst. Analyze the following article and provide:
1. A concise summary (2-4 sentences) focusing on new ideas, unique points of view, or notable pieces of code. Be specific — mention names, numbers, and concrete details rather than vague generalities.
2. 1-5 relevant topic tags (lowercase, single words or hyphenated).

Respond in JSON format exactly like this:
{
  "summary": "Your summary here",
  "tags": ["tag1", "tag2"]
}`;

export const MAX_CONTENT_CHARS = 40_000; // ~10k tokens, well within context window

/**
 * Parse the LLM response text into a structured ArticleSummary.
 * Exported for testability.
 */
export function parseSummaryResponse(text: string): ArticleSummary {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || "No summary available.",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    // Graceful fallback: use raw text as summary
    return { summary: text.slice(0, 500), tags: [] };
  }
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async summarize(title: string, content: string): Promise<ArticleSummary> {
    const truncated = content.slice(0, MAX_CONTENT_CHARS);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${SUMMARIZE_PROMPT}\n\nArticle title: ${title}\n\nArticle content:\n${truncated}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseSummaryResponse(text);
  }
}
