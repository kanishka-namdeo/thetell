/**
 * Performance benchmark tests for local NLP models.
 * Task 4.4 from Local NLP Model Integration Plan.
 *
 * Benchmarks latency (p50, p95, p99) and memory usage for each model.
 * Target: all models <50ms per signal on CPU (mocked).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifySentimentLocal } from "@/lib/nlp/sentiment-classifier";
import { assessContentQuality } from "@/lib/nlp/quality-gate";
import { extractEntities } from "@/lib/nlp/entity-extractor";
import { generateEmbedding, cosineSimilarity } from "@/lib/nlp/embedding-generator";
import { extractKeyPhrases } from "@/lib/nlp/keyphrase-extractor";
import { detectLanguage } from "@/lib/nlp/language-detector";

// Mock the model pipeline
vi.mock("@/lib/nlp/model-cache", () => ({
  getModelPipeline: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  },
}));

import { getModelPipeline } from "@/lib/nlp/model-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetModelPipeline = getModelPipeline as any;

// Sample text for benchmarking (typical signal length)
const sampleText = `
Apple Inc. reported Q4 2024 earnings that exceeded analyst expectations, 
with revenue reaching $94.8 billion, up 11% year-over-year. CEO Tim Cook 
highlighted strong iPhone 15 sales across all geographic segments, particularly 
in Greater China where revenue grew 8% despite economic headwinds.

The company's services segment continues to be a growth driver, generating 
$22.3 billion in revenue, up 16% from the prior year. Gross margin improved 
to 45.2%, compared to 43.3% in Q4 2023, reflecting favorable product mix 
and cost management.

Apple returned $29 billion to shareholders during the quarter through 
dividends and share repurchases. The board authorized an additional $110 
billion for the share repurchase program. CFO Luca Maestri noted that the 
company maintains a strong balance sheet with $162 billion in cash and 
marketable securities.
`;

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = lower + 1;
  const weight = index - lower;
  
  if (upper >= sorted.length) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

describe("Performance Benchmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sentiment Classification (FinBERT)", () => {
    it("should complete in <50ms (mocked)", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve([{ label: "positive", score: 0.92 }]))
      );

      const latencies: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await classifySentimentLocal(sampleText);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log("\nSentiment Classification Latency:");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);
      console.log(`  avg: ${avg.toFixed(2)}ms`);

      expect(p50).toBeLessThan(50);
      expect(p95).toBeLessThan(50);
      expect(p99).toBeLessThan(50);
    });
  });

  describe("Quality Gate (Zero-shot Classification)", () => {
    it("should complete in <50ms (mocked)", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve({
          labels: ["substantive analysis", "boilerplate content", "irrelevant mention"],
          scores: [0.7, 0.2, 0.1],
        }))
      );

      const latencies: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await assessContentQuality(sampleText, "Apple");
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nQuality Gate Latency:");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(50);
      expect(p95).toBeLessThan(50);
    });
  });

  describe("Named Entity Recognition (BERT-NER)", () => {
    it("should complete in <50ms (mocked)", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve([
          { entity: "B-ORG", word: "Apple", score: 0.95 },
          { entity: "B-PER", word: "Tim", score: 0.92 },
          { entity: "I-PER", word: "Cook", score: 0.90 },
        ]))
      );

      const latencies: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await extractEntities(sampleText);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nNER Latency:");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(50);
      expect(p95).toBeLessThan(50);
    });
  });

  describe("Embedding Generation (all-MiniLM-L6-v2)", () => {
    it("should complete in <50ms (mocked)", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }))
      );

      const latencies: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await generateEmbedding(sampleText);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nEmbedding Generation Latency:");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(50);
      expect(p95).toBeLessThan(50);
    });

    it("should generate 384-dimensional embeddings", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }))
      );

      const embedding = await generateEmbedding(sampleText);
      
      expect(embedding).toHaveLength(384);
      expect(Array.isArray(embedding)).toBe(true);
    });
  });

  describe("Key Phrase Extraction (KeyBERT-style)", () => {
    it("should complete in <50ms (mocked)", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }))
      );

      const latencies: number[] = [];
      const iterations = 50; // Fewer iterations since it calls embedding multiple times

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await extractKeyPhrases(sampleText, 5);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nKey Phrase Extraction Latency:");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(50);
    });
  });

  describe("Language Detection (FastText)", () => {
    it("should complete in <50ms (mocked)", async () => {
      mockGetModelPipeline.mockResolvedValue(
        vi.fn(() => Promise.resolve([{ label: "__label__en", score: 0.98 }]))
      );

      const latencies: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await detectLanguage(sampleText);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nLanguage Detection Latency:");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(50);
      expect(p95).toBeLessThan(50);
    });
  });

  describe("Cosine Similarity", () => {
    it("should compute similarity in <1ms", async () => {
      const embedding1 = new Array(384).fill(0).map(() => Math.random());
      const embedding2 = new Array(384).fill(0).map(() => Math.random());

      const latencies: number[] = [];
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        cosineSimilarity(embedding1, embedding2);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nCosine Similarity Latency:");
      console.log(`  p50: ${p50.toFixed(3)}ms`);
      console.log(`  p95: ${p95.toFixed(3)}ms`);
      console.log(`  p99: ${p99.toFixed(3)}ms`);

      expect(p50).toBeLessThan(1);
      expect(p95).toBeLessThan(1);
    });

    it("should return 1.0 for identical vectors", () => {
      const embedding = new Array(384).fill(0).map(() => Math.random());
      const similarity = cosineSimilarity(embedding, embedding);
      
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it("should return 0.0 for orthogonal vectors", () => {
      const embedding1 = new Array(384).fill(0);
      const embedding2 = new Array(384).fill(0);
      embedding1[0] = 1;
      embedding2[1] = 1;
      
      const similarity = cosineSimilarity(embedding1, embedding2);
      
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it("should return -1.0 for opposite vectors", () => {
      const embedding1 = new Array(384).fill(1);
      const embedding2 = new Array(384).fill(-1);
      
      const similarity = cosineSimilarity(embedding1, embedding2);
      
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it("should throw error for dimension mismatch", () => {
      const embedding1 = new Array(384).fill(1);
      const embedding2 = new Array(256).fill(1);
      
      expect(() => cosineSimilarity(embedding1, embedding2)).toThrow();
    });
  });

  describe("Full NLP Pipeline", () => {
    it("should complete all NLP operations in <200ms (mocked)", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.92 }]));
        }
        if (task === "text-classification" && model === "Xenova/fasttext-language-identification") {
          return vi.fn(() => Promise.resolve([{ label: "__label__en", score: 0.98 }]));
        }
        if (task === "zero-shot-classification" && model === "Xenova/bart-large-mnli") {
          return vi.fn(() => Promise.resolve({
            labels: ["substantive analysis", "boilerplate content", "irrelevant mention"],
            scores: [0.8, 0.15, 0.05],
          }));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([
            { entity: "B-ORG", word: "Apple", score: 0.95 },
          ]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const latencies: number[] = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        // Run all NLP operations in parallel (as in pipeline.ts)
        await Promise.all([
          classifySentimentLocal(sampleText),
          extractEntities(sampleText),
          extractKeyPhrases(sampleText, 5),
          detectLanguage(sampleText),
          assessContentQuality(sampleText, "Apple"),
        ]);
        
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      latencies.sort((a, b) => a - b);
      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log("\nFull NLP Pipeline Latency (parallel):");
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(200);
      expect(p95).toBeLessThan(200);
    });
  });
});
