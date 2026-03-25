export interface ArticleSummary {
  summary: string;
  tags: string[];
}

export interface LLMProvider {
  summarize(title: string, content: string): Promise<ArticleSummary>;
}
