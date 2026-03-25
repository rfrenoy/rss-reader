import type { ArticleSummary } from "./types";

export const SUMMARIZE_PROMPT = `You are an expert content analyst. Analyze the following article and provide:
1. A concise summary (2-4 sentences) focusing on new ideas, unique points of view, or notable pieces of code. Be specific — mention names, numbers, and concrete details rather than vague generalities.
2. 1-5 relevant topic tags (lowercase, single words or hyphenated).

Respond in JSON format exactly like this:
{
  "summary": "Your summary here",
  "tags": ["tag1", "tag2"]
}`;

export const MAX_CONTENT_CHARS = 40_000;

/**
 * Build the user message for summarization.
 */
export function buildSummarizeMessage(
  title: string,
  content: string,
  maxChars: number = MAX_CONTENT_CHARS
): string {
  const truncated = content.slice(0, maxChars);
  return `${SUMMARIZE_PROMPT}\n\nArticle title: ${title}\n\nArticle content:\n${truncated}`;
}

/**
 * Parse the LLM response text into a structured ArticleSummary.
 * Handles well-formed JSON, JSON embedded in text, and graceful fallback.
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
    return { summary: text.slice(0, 500), tags: [] };
  }
}
