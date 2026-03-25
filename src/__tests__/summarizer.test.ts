import { describe, it, expect } from "vitest";
import { summarizeArticle } from "../summarizer";
import type { LLMProvider, ArticleSummary } from "../llm/types";
import type { FetchedArticle } from "../fetcher";

function makeMockLLM(response: ArticleSummary): LLMProvider {
  return {
    summarize: async (_title: string, _content: string) => response,
  };
}

function makeArticle(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    guid: "guid-1",
    url: "https://example.com/1",
    title: "Test Article",
    content: "This is the full article content.",
    published_at: null,
    ...overrides,
  };
}

describe("summarizeArticle", () => {
  it("returns LLM result for article with content", async () => {
    const llm = makeMockLLM({
      summary: "LLM summary",
      tags: ["ai"],
    });
    const result = await summarizeArticle(llm, makeArticle());
    expect(result.summary).toBe("LLM summary");
    expect(result.tags).toEqual(["ai"]);
  });

  it("returns fallback when content is empty", async () => {
    const llm = makeMockLLM({
      summary: "Should not be called",
      tags: [],
    });
    const result = await summarizeArticle(llm, makeArticle({ content: "" }));
    expect(result.summary).toBe("Content could not be extracted.");
    expect(result.tags).toEqual([]);
  });

  it("passes title and content to the LLM provider", async () => {
    let receivedTitle = "";
    let receivedContent = "";
    const llm: LLMProvider = {
      summarize: async (title, content) => {
        receivedTitle = title;
        receivedContent = content;
        return { summary: "s", tags: [] };
      },
    };
    await summarizeArticle(
      llm,
      makeArticle({ title: "My Title", content: "My Content" })
    );
    expect(receivedTitle).toBe("My Title");
    expect(receivedContent).toBe("My Content");
  });
});
