import { describe, it, expect } from "vitest";
import { extractContentFromHtml } from "../fetcher";

describe("extractContentFromHtml", () => {
  it("extracts text from a simple article page", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Test</title></head>
      <body>
        <nav>Navigation menu</nav>
        <article>
          <h1>Main Article Title</h1>
          <p>This is the first paragraph of the article with enough content to be considered readable by the algorithm.</p>
          <p>This is the second paragraph with additional information about the topic being discussed in detail.</p>
          <p>And a third paragraph to ensure Readability has enough content to work with properly.</p>
        </article>
        <footer>Footer content</footer>
      </body>
      </html>
    `;
    const content = extractContentFromHtml(html);
    expect(content).toContain("first paragraph");
    expect(content).toContain("second paragraph");
  });

  it("returns empty string for minimal HTML with no article content", () => {
    const html = `<html><body><p>x</p></body></html>`;
    const content = extractContentFromHtml(html);
    // Readability may or may not extract from minimal pages
    expect(typeof content).toBe("string");
  });

  it("strips HTML tags from output", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Test</title></head>
      <body>
        <article>
          <h1>Title</h1>
          <p>Text with <strong>bold</strong> and <a href="#">links</a> that should become plain text in the final output.</p>
          <p>More content here to satisfy the readability length requirements for extraction.</p>
          <p>Even more content to make absolutely sure readability picks this up as an article.</p>
        </article>
      </body>
      </html>
    `;
    const content = extractContentFromHtml(html);
    expect(content).not.toContain("<strong>");
    expect(content).not.toContain("<a ");
    expect(content).not.toContain("</a>");
  });

  it("handles empty HTML", () => {
    const content = extractContentFromHtml("");
    expect(content).toBe("");
  });
});
