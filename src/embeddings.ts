// ── Types ──────────────────────────────────────────────

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

// ── Ollama embedding provider ──────────────────────────

const EMBED_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_EMBED_CHARS = 24_000; // ~6k tokens, safe for most embedding models

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private model: string,
    private baseUrl: string
  ) {}

  async embed(text: string): Promise<number[]> {
    const truncated = text.slice(0, MAX_EMBED_CHARS);
    const url = `${this.baseUrl}/api/embed`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
        body: JSON.stringify({
          model: this.model,
          input: truncated,
        }),
      });
    } catch (err: any) {
      const cause = err.cause
        ? ` (cause: ${err.cause.message ?? err.cause})`
        : "";
      throw new Error(
        `Embedding request failed: ${err.message}${cause}`
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding HTTP ${response.status}: ${body}`);
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    if (!data.embeddings?.[0]?.length) {
      throw new Error("Empty embedding returned from Ollama");
    }

    return data.embeddings[0];
  }
}

// ── Vector math ────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ── Novelty scoring ────────────────────────────────────

export interface NoveltyResult {
  /** 0 = identical to something in archive, 1 = completely novel */
  score: number;
  /** Similarity to the closest existing article */
  maxSimilarity: number;
  /** Article ID of the closest match, if any */
  closestArticleId: number | null;
}

export function computeNovelty(
  embedding: number[],
  archive: { articleId: number; vector: number[] }[]
): NoveltyResult {
  if (archive.length === 0) {
    return { score: 1.0, maxSimilarity: 0, closestArticleId: null };
  }

  let maxSimilarity = -Infinity;
  let closestArticleId: number | null = null;

  for (const entry of archive) {
    const sim = cosineSimilarity(embedding, entry.vector);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      closestArticleId = entry.articleId;
    }
  }

  // Clamp to [0, 1]
  const score = Math.max(0, Math.min(1, 1 - maxSimilarity));
  return { score, maxSimilarity, closestArticleId };
}

// ── Serialization (for SQLite BLOB storage) ────────────

export function serializeVector(vector: number[]): Buffer {
  return Buffer.from(new Float64Array(vector).buffer);
}

export function deserializeVector(buffer: Buffer): number[] {
  return Array.from(
    new Float64Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 8
    )
  );
}

// ── Display helpers ────────────────────────────────────

/**
 * Convert a novelty score (0-1) to a 1-5 star rating string.
 */
export function noveltyToStars(score: number): string {
  const stars = Math.max(1, Math.min(5, Math.ceil(score * 5)));
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}
