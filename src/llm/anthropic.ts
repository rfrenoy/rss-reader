import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ArticleSummary } from "./types";
import { buildSummarizeMessage, parseSummaryResponse } from "./shared";

export { parseSummaryResponse } from "./shared";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async summarize(title: string, content: string): Promise<ArticleSummary> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: buildSummarizeMessage(title, content),
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseSummaryResponse(text);
  }
}
