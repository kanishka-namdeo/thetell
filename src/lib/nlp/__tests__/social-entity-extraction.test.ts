/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test 4: Social entity extraction.
 *
 * Tests that extractEntities merges social-specific entities
 * (Reddit usernames, subreddits, hashtags, stock tickers) when
 * sourceType is "SOCIAL", and does not include them otherwise.
 *
 * NOTE: Monetary regex runs for ALL source types, so "$100 million"
 * will be extracted even for non-SOCIAL types.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { getModelPipeline } from "@/lib/nlp/model-cache";
import { extractEntities } from "@/lib/nlp/entity-extractor";

const mockGetModelPipeline = vi.mocked(getModelPipeline);

const socialText = `
  u/deepvalue99 posted on r/wallstreetbets that $AAPL is going to the moon!
  Also check out r/stocks and u/trader_joe for more takes.
  #stocks #investing $TSLA are trending.
`;

const nonSocialText = `
  Apple Inc. reported Q3 results. CEO Tim Cook announced new investments
  on January 15, 2025 in Cupertino, California.
`;

/**
 * Mock BERT-NER to return minimal entities so we can verify
 * the social-specific additions are merged correctly.
 */
function mockNerWithEmpty() {
  mockGetModelPipeline.mockResolvedValue((async () => []) as any);
}

describe("Social entity extraction via extractEntities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNerWithEmpty();
  });

  it("extracts Reddit usernames (u/username) for SOCIAL source type", async () => {
    const result = await extractEntities(socialText, "SOCIAL");
    // extractSocialEntities captures group 1 from u/(\w+), so "deepvalue99" not "u/deepvalue99"
    expect(result.persons).toContain("deepvalue99");
    expect(result.persons).toContain("trader_joe");
    // Should NOT contain the "u/" prefix
    expect(result.persons.some((p) => p.startsWith("u/"))).toBe(false);
  });

  it("extracts subreddits (r/subreddit) for SOCIAL source type", async () => {
    const result = await extractEntities(socialText, "SOCIAL");
    // extractSocialEntities captures group 1 from r/(\w+), so "wallstreetbets" not "r/wallstreetbets"
    expect(result.organizations).toContain("wallstreetbets");
    expect(result.organizations).toContain("stocks");
    // Should NOT contain the "r/" prefix
    expect(result.organizations.some((o) => o.startsWith("r/"))).toBe(false);
  });

  it("extracts hashtags (#stocks) for SOCIAL source type", async () => {
    const result = await extractEntities(socialText, "SOCIAL");
    expect(result.organizations).toContain("stocks");
    expect(result.organizations).toContain("investing");
  });

  it("extracts stock tickers ($AAPL) for SOCIAL source type", async () => {
    const result = await extractEntities(socialText, "SOCIAL");
    expect(result.monetary).toContain("$AAPL");
    expect(result.monetary).toContain("$TSLA");
  });

  it("does not include social entities for non-SOCIAL source types", async () => {
    const result = await extractEntities(nonSocialText, "NEWS");
    // BERT-NER is mocked to return empty, and social extraction is skipped
    // Monetary regex still runs for all types, but nonSocialText has no $ amounts
    expect(result.persons).toEqual([]);
    expect(result.organizations).toEqual([]);
    expect(result.monetary).toEqual([]);
  });

  it("does not include social entities when sourceType is undefined", async () => {
    const result = await extractEntities(socialText);
    // Without sourceType="SOCIAL", social entities are not merged
    expect(result.persons).not.toContain("deepvalue99");
    expect(result.organizations).not.toContain("wallstreetbets");
    // Stock tickers like $AAPL are only extracted by extractSocialEntities for SOCIAL sources
    expect(result.monetary).not.toContain("$AAPL");
    expect(result.monetary).not.toContain("$TSLA");
  });

  it("deduplicates social entities", async () => {
    // "stocks" appears as both r/stocks and #stocks
    const result = await extractEntities(socialText, "SOCIAL");
    const stocksCount = result.organizations.filter((o) => o === "stocks").length;
    expect(stocksCount).toBe(1);
  });
});
