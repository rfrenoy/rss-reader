import type { ArticleSummary } from "./types";

export const SUMMARIZE_PROMPT = `You are an expert content analyst. Analyze the following article and provide:
1. A concise summary (2-4 sentences) focusing on new ideas, unique points of view, or notable pieces of code. Be specific — mention names, numbers, and concrete details rather than vague generalities.
2. 1-5 relevant topic tags (lowercase, single words or hyphenated).

Respond in JSON format exactly like this:
{
  "summary": "Your summary here",
  "tags": ["tag1", "tag2"]
}`;

export const MAX_CONTENT_CHARS = 12_000; // ~3k tokens, keeps small models responsive

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
    const summary = typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : null;
    if (!summary) {
      console.warn(`    ⚠ LLM returned empty summary. Raw response: ${text.slice(0, 200)}`);
    }
    return {
      summary: summary || "No summary available.",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    console.warn(`    ⚠ Failed to parse LLM JSON. Raw response: ${text.slice(0, 200)}`);
    return { summary: text.slice(0, 500), tags: [] };
  }
}
