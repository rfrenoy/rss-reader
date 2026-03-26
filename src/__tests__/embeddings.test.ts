import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  computeNovelty,
  serializeVector,
  deserializeVector,
  noveltyToStars,
} from "../embeddings";

// ── cosineSimilarity ───────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("handles arbitrary vectors", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // Manual: dot=32, |a|=sqrt(14), |b|=sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected);
  });

  it("returns 0 for zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      "dimension mismatch"
    );
  });
});

// ── computeNovelty ─────────────────────────────────────

describe("computeNovelty", () => {
  it("returns score 1.0 when archive is empty", () => {
    const result = computeNovelty([1, 2, 3], []);
    expect(result.score).toBe(1.0);
    expect(result.closestArticleId).toBeNull();
  });

  it("returns low score for near-identical article", () => {
    const embedding = [1, 0, 0];
    const archive = [{ articleId: 42, vector: [1, 0, 0] }];
    const result = computeNovelty(embedding, archive);
    expect(result.score).toBeCloseTo(0.0);
    expect(result.maxSimilarity).toBeCloseTo(1.0);
    expect(result.closestArticleId).toBe(42);
  });

  it("returns high score for orthogonal article", () => {
    const embedding = [1, 0, 0];
    const archive = [{ articleId: 1, vector: [0, 1, 0] }];
    const result = computeNovelty(embedding, archive);
    expect(result.score).toBeCloseTo(1.0);
    expect(result.maxSimilarity).toBeCloseTo(0.0);
  });

  it("finds the closest match among multiple articles", () => {
    const embedding = [1, 0, 0];
    const archive = [
      { articleId: 1, vector: [0, 1, 0] }, // orthogonal
      { articleId: 2, vector: [0.9, 0.1, 0] }, // close
      { articleId: 3, vector: [0, 0, 1] }, // orthogonal
    ];
    const result = computeNovelty(embedding, archive);
    expect(result.closestArticleId).toBe(2);
    expect(result.maxSimilarity).toBeGreaterThan(0.9);
    expect(result.score).toBeLessThan(0.1);
  });

  it("clamps score to [0, 1]", () => {
    // Negative similarity (opposite vectors) should clamp to score 1.0
    const embedding = [1, 0];
    const archive = [{ articleId: 1, vector: [-1, 0] }];
    const result = computeNovelty(embedding, archive);
    expect(result.score).toBe(1.0);
  });
});

// ── serializeVector / deserializeVector ────────────────

describe("vector serialization", () => {
  it("roundtrips a vector", () => {
    const original = [1.5, -2.7, 0, 3.14159, 1e-10];
    const buffer = serializeVector(original);
    const restored = deserializeVector(buffer);
    expect(restored).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]);
    }
  });

  it("produces a buffer of correct size (8 bytes per float64)", () => {
    const buffer = serializeVector([1, 2, 3]);
    expect(buffer.byteLength).toBe(3 * 8);
  });

  it("handles empty vector", () => {
    const buffer = serializeVector([]);
    const restored = deserializeVector(buffer);
    expect(restored).toEqual([]);
  });
});

// ── noveltyToStars ─────────────────────────────────────

describe("noveltyToStars", () => {
  it("returns 5 stars for score 1.0", () => {
    expect(noveltyToStars(1.0)).toBe("★★★★★");
  });

  it("returns 1 star for score 0.0", () => {
    expect(noveltyToStars(0.0)).toBe("★☆☆☆☆");
  });

  it("returns 3 stars for score ~0.5", () => {
    expect(noveltyToStars(0.5)).toBe("★★★☆☆");
  });

  it("returns 5 stars for score 0.85", () => {
    expect(noveltyToStars(0.85)).toBe("★★★★★");
  });

  it("returns 2 stars for score 0.25", () => {
    expect(noveltyToStars(0.25)).toBe("★★☆☆☆");
  });
});
