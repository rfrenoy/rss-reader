import type { LLMProvider, ArticleSummary } from "./llm/types";
import type { FetchedArticle } from "./fetcher";

export async function summarizeArticle(
  llm: LLMProvider,
  article: FetchedArticle
): Promise<ArticleSummary> {
  if (!article.content) {
    return { summary: "Content could not be extracted.", tags: [] };
  }
  return llm.summarize(article.title, article.content);
}
