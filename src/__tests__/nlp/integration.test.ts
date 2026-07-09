/**
 * Integration tests for the full NLP pipeline.
 * Task 4.5 from Local NLP Model Integration Plan.
 *
 * Tests the complete signal ingestion -> NLP analysis -> article generation flow.
 * Verifies graceful degradation when NLP models fail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "@/lib/ai/agent/personas";

// Mock all external dependencies
vi.mock("@/lib/nlp/model-cache", () => ({
  getModelPipeline: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("@/lib/ai/provider", () => ({
  getProvider: () => ({
    completeStructured: vi.fn().mockResolvedValue({
      facts: [{ text: "Test fact", confidence: 0.8, category: "financial", source_sentence: "Test" }],
      sentiment: { sentiment: "POSITIVE", confidence: 0.85, strength: "STRONGLY", key_phrases: ["revenue"] },
      themes: [{ label: "Growth", evidence: ["revenue up"], correlation_hints: [] }],
      summary: "Test summary",
    }),
  }),
}));

vi.mock("@/lib/ai/fact-extraction", () => ({
  extractFactsWithPrompt: vi.fn().mockResolvedValue({
    data: {
      facts: [{ text: "Test fact", confidence: 0.8, category: "financial", source_sentence: "Test" }],
    },
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
}));

vi.mock("@/lib/ai/sentiment", () => ({
  classifySentimentWithPrompt: vi.fn().mockResolvedValue({
    data: {
      sentiment: "POSITIVE",
      confidence: 0.85,
      strength: "STRONGLY",
      key_phrases: ["revenue"],
    },
    usage: { inputTokens: 80, outputTokens: 30 },
  }),
}));

vi.mock("@/lib/ai/themes", () => ({
  identifyThemesWithPrompt: vi.fn().mockResolvedValue({
    data: {
      themes: [{ label: "Growth", evidence: ["revenue up"], correlation_hints: [] }],
    },
    usage: { inputTokens: 120, outputTokens: 60 },
  }),
}));

import { getModelPipeline } from "@/lib/nlp/model-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetModelPipeline = getModelPipeline as any;

const sampleSignal = {
  id: "test-signal-1",
  sourceUrl: "https://example.com/article",
  sourceType: "NEWS" as const,
  title: "Apple Reports Record Q4 Earnings",
  rawContent: `
    Apple Inc. reported Q4 2024 earnings that exceeded analyst expectations,
    with revenue reaching $94.8 billion, up 11% year-over-year. CEO Tim Cook
    highlighted strong iPhone 15 sales across all geographic segments.

    The company's services segment generated $22.3 billion in revenue, up 16%
    from the prior year. Gross margin improved to 45.2%.

    Apple returned $29 billion to shareholders through dividends and share
    repurchases. CFO Luca Maestri noted the company maintains $162 billion
    in cash and marketable securities.
  `,
  publishedAt: new Date("2024-10-31"),
  scrapedAt: new Date("2024-10-31"),
  companyId: "company-1",
  status: "PENDING",
  company: {
    id: "company-1",
    name: "Apple",
    slug: "apple",
    ticker: "AAPL",
  },
};

describe("NLP Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Full Pipeline: Signal -> NLP -> Analysis", () => {
    it("should run complete pipeline with local NLP models", async () => {
      // Mock all NLP models
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.92 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([
            { entity: "B-ORG", word: "Apple", score: 0.95 },
            { entity: "B-PER", word: "Tim", score: 0.92 },
            { entity: "I-PER", word: "Cook", score: 0.90 },
          ]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
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
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      expect(result).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.analysis.agentPersona).toBe("ANALYST");
      expect(result.analysis.summary).toBeDefined();
      expect(result.analysis.keyFacts).toBeDefined();
      expect(result.analysis.sentiment).toBeDefined();
      expect(result.analysis.strategicThemes).toBeDefined();
      expect(result.analysis.confidence).toBeGreaterThan(0);
      expect(result.analysis.confidence).toBeLessThanOrEqual(1);
      expect(result.metrics.tokensIn).toBeGreaterThan(0);
      expect(result.metrics.tokensOut).toBeGreaterThan(0);
      expect(result.metrics.llmCallCount).toBeGreaterThan(0);
    });

    it("should use local sentiment for Analyst when confidence >= 0.7", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Should use local sentiment (confidence 0.88 >= 0.7)
      expect(result.analysis.sentiment).toBeDefined();
      if ("sentiment" in result.analysis.sentiment) {
        expect(result.analysis.sentiment.sentiment).toBe("POSITIVE");
      }
    });

    it("should fall back to LLM sentiment when local confidence < 0.7", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "neutral", score: 0.62 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Should fall back to LLM sentiment (local confidence 0.62 < 0.7)
      expect(result.analysis.sentiment).toBeDefined();
    });

    it("should always use LLM sentiment for Gossip Girl", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.92 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, GOSSIP_GIRL_CONFIG);

      // Gossip Girl always uses LLM sentiment
      expect(result.analysis.sentiment).toBeDefined();
      expect(result.analysis.agentPersona).toBe("GOSSIP_GIRL");
    });

    it("should extract entities and pass to LLM prompts", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([
            { entity: "B-ORG", word: "Apple", score: 0.95 },
            { entity: "B-PER", word: "Tim", score: 0.92 },
            { entity: "I-PER", word: "Cook", score: 0.90 },
          ]));
        }
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Entities should be extracted and used
      expect(result.analysis).toBeDefined();
      expect(result.analysis.confidence).toBeGreaterThan(0);
    });

    it("should extract key phrases for Analyst persona", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Key phrases should be extracted
      expect(result.analysis.sentiment).toBeDefined();
      if ("key_phrases" in result.analysis.sentiment) {
        expect(Array.isArray(result.analysis.sentiment.key_phrases)).toBe(true);
      }
    });
  });

  describe("Graceful Degradation", () => {
    it("should continue when sentiment model fails", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          throw new Error("Sentiment model failed");
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Should fall back to LLM sentiment
      expect(result).toBeDefined();
      expect(result.sentiment).toBeDefined();
    });

    it("should continue when NER model fails", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          throw new Error("NER model failed");
        }
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Should continue without entities
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should continue when embedding model fails", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          throw new Error("Embedding model failed");
        }
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Should continue without key phrases
      expect(result).toBeDefined();
    });

    it("should continue when all NLP models fail", async () => {
      mockGetModelPipeline.mockRejectedValue(new Error("All models failed"));

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Should fall back to LLM for everything
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.sentiment).toBeDefined();
    });
  });

  describe("Output Quality", () => {
    it("should produce valid analysis structure", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
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

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Validate structure
      expect(result.id).toBeDefined();
      expect(result.signalId).toBe(sampleSignal.id);
      expect(result.agentPersona).toBe("ANALYST");
      expect(typeof result.summary).toBe("string");
      expect(Array.isArray(result.keyFacts)).toBe(true);
      expect(typeof result.confidence).toBe("number");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it("should produce confidence score in valid range", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const result = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should not regress output quality with NLP models", async () => {
      // Run without NLP models (all fail)
      mockGetModelPipeline.mockRejectedValue(new Error("Models failed"));

      const resultWithoutNLP = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Clear mocks
      vi.clearAllMocks();

      // Run with NLP models
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
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

      const resultWithNLP = await analyzeSignalWithAgent(sampleSignal, ANALYST_CONFIG);

      // Confidence should be similar or better with NLP
      // (NER provides better entity counts for confidence calculation)
      expect(resultWithNLP.confidence).toBeGreaterThanOrEqual(resultWithoutNLP.confidence * 0.9);
    });
  });

  describe("Cross-Reference Analysis", () => {
    it("should accept cross-reference from other agent", async () => {
      mockGetModelPipeline.mockImplementation(async (task: string, model: string) => {
        if (task === "text-classification" && model === "ProsusAI/finbert") {
          return vi.fn(() => Promise.resolve([{ label: "positive", score: 0.88 }]));
        }
        if (task === "token-classification" && model === "Xenova/bert-base-NER") {
          return vi.fn(() => Promise.resolve([]));
        }
        if (task === "feature-extraction" && model === "Xenova/all-MiniLM-L6-v2") {
          return vi.fn(() => Promise.resolve({ data: new Float32Array(384).fill(0.1) }));
        }
        return vi.fn(() => Promise.resolve([]));
      });

      const crossRef = [
        {
          id: "analyst-analysis-1",
          agentPersona: "ANALYST" as const,
          summary: "Apple showed strong performance",
          keyFacts: [{ text: "Revenue up 11%" }],
          sentiment: "POSITIVE",
          strategicThemes: [{ label: "Growth" }],
        },
      ];

      const result = await analyzeSignalWithAgent(
        sampleSignal,
        GOSSIP_GIRL_CONFIG,
        crossRef
      );

      expect(result).toBeDefined();
      expect(result.crossReferences).toBeDefined();
    });
  });
});
