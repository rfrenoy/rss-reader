import { describe, it, expect } from "vitest";
import { parseSummaryResponse } from "../llm/anthropic";

describe("parseSummaryResponse", () => {
  it("parses well-formed JSON response", () => {
    const text = `{
      "summary": "This article discusses new caching strategies.",
      "tags": ["caching", "performance", "web"]
    }`;
    const result = parseSummaryResponse(text);
    expect(result.summary).toBe("This article discusses new caching strategies.");
    expect(result.tags).toEqual(["caching", "performance", "web"]);
  });

  it("extracts JSON embedded in surrounding text", () => {
    const text = `Here is the analysis:

{
  "summary": "A deep dive into WebAssembly.",
  "tags": ["wasm", "web"]
}

Hope this helps!`;
    const result = parseSummaryResponse(text);
    expect(result.summary).toBe("A deep dive into WebAssembly.");
    expect(result.tags).toEqual(["wasm", "web"]);
  });

  it("handles missing summary field gracefully", () => {
    const text = `{"tags": ["test"]}`;
    const result = parseSummaryResponse(text);
    expect(result.summary).toBe("No summary available.");
    expect(result.tags).toEqual(["test"]);
  });

  it("handles missing tags field gracefully", () => {
    const text = `{"summary": "A summary"}`;
    const result = parseSummaryResponse(text);
    expect(result.summary).toBe("A summary");
    expect(result.tags).toEqual([]);
  });

  it("handles tags as non-array gracefully", () => {
    const text = `{"summary": "A summary", "tags": "not-an-array"}`;
    const result = parseSummaryResponse(text);
    expect(result.tags).toEqual([]);
  });

  it("falls back to raw text when no JSON found", () => {
    const text = "I couldn't analyze this article properly.";
    const result = parseSummaryResponse(text);
    expect(result.summary).toBe(text);
    expect(result.tags).toEqual([]);
  });

  it("falls back to raw text on malformed JSON", () => {
    const text = "Here is the result: {broken json{{{";
    const result = parseSummaryResponse(text);
    expect(result.summary).toBe(text.slice(0, 500));
    expect(result.tags).toEqual([]);
  });

  it("truncates long fallback text to 500 chars", () => {
    const text = "x".repeat(1000);
    const result = parseSummaryResponse(text);
    expect(result.summary).toHaveLength(500);
  });

  it("handles empty string", () => {
    const result = parseSummaryResponse("");
    expect(result.summary).toBe("");
    expect(result.tags).toEqual([]);
  });
});
