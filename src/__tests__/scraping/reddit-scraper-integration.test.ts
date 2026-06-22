/**
 * Integration tests for the Reddit scraper's scrapeForCompanies method.
 *
 * Tests that the scraper correctly combines default subreddits,
 * tracked subreddits from the DB, and ticker-based subreddits,
 * with deduplication.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the prisma mock so it can be referenced by the vi.mock factory.
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    trackedSubreddit: {
      findMany: vi.fn(),
    },
  };
  return { mockPrisma };
});

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/scraping/url-normalizer", () => ({
  normalizeUrl: (url: string) => url,
  computeContentHash: (_url: string, data: string) => `hash-${data.length}`,
}));

vi.mock("robots-parser", () => ({
  default: () => ({
    isAllowed: () => true,
  }),
}));

import { RedditFinancialScraper } from "@/lib/scraping/reddit-financial-scraper";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RedditFinancialScraper.scrapeForCompanies", () => {
  it("combines default + tracked + ticker subreddits", async () => {
    mockPrisma.trackedSubreddit.findMany.mockResolvedValue([
      { subreddit: "biotech" },
      { subreddit: "mrna" },
    ]);

    const scraper = new RedditFinancialScraper();

    // Spy on the private scrapeSubreddit method to track which subreddits are scraped
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrapeSubredditSpy = vi.spyOn(scraper as any, "scrapeSubreddit").mockResolvedValue([]);

    const companies = [{ id: "company-1", ticker: "MRNA" }];
    await scraper.scrapeForCompanies(companies);

    const scrapedSubreddits = scrapeSubredditSpy.mock.calls.map((call) => call[0]);

    // Should include defaults: wallstreetbets, stocks, investing
    expect(scrapedSubreddits).toContain("wallstreetbets");
    expect(scrapedSubreddits).toContain("stocks");
    expect(scrapedSubreddits).toContain("investing");

    // Should include tracked subreddits from DB
    expect(scrapedSubreddits).toContain("biotech");
    expect(scrapedSubreddits).toContain("mrna");

    // Ticker-based subreddit (lowercase) is present (deduped with tracked "mrna")
    expect(scrapedSubreddits.filter((s: string) => s === "mrna")).toHaveLength(1);

    scrapeSubredditSpy.mockRestore();
  });

  it("deduplicates subreddits across companies", async () => {
    mockPrisma.trackedSubreddit.findMany.mockResolvedValue([
      { subreddit: "biotech" },
      { subreddit: "biotech" }, // duplicate from another company
      { subreddit: "stocks" }, // also in defaults
    ]);

    const scraper = new RedditFinancialScraper();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrapeSubredditSpy = vi.spyOn(scraper as any, "scrapeSubreddit").mockResolvedValue([]);

    const companies = [
      { id: "company-1", ticker: "MRNA" },
      { id: "company-2", ticker: "PFE" },
    ];
    await scraper.scrapeForCompanies(companies);

    const scrapedSubreddits = scrapeSubredditSpy.mock.calls.map((call) => call[0]);

    // "biotech" should only appear once despite duplicates in DB
    const biotechCount = scrapedSubreddits.filter((s: string) => s === "biotech").length;
    expect(biotechCount).toBe(1);

    // "stocks" should only appear once (it's in both defaults and tracked)
    const stocksCount = scrapedSubreddits.filter((s: string) => s === "stocks").length;
    expect(stocksCount).toBe(1);

    scrapeSubredditSpy.mockRestore();
  });

  it("falls back to defaults when no tracked subreddits exist", async () => {
    mockPrisma.trackedSubreddit.findMany.mockResolvedValue([]);

    const scraper = new RedditFinancialScraper();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrapeSubredditSpy = vi.spyOn(scraper as any, "scrapeSubreddit").mockResolvedValue([]);

    const companies = [{ id: "company-1", ticker: null }];
    await scraper.scrapeForCompanies(companies);

    const scrapedSubreddits = scrapeSubredditSpy.mock.calls.map((call) => call[0]);

    // Should only have defaults
    expect(scrapedSubreddits).toContain("wallstreetbets");
    expect(scrapedSubreddits).toContain("stocks");
    expect(scrapedSubreddits).toContain("investing");
    expect(scrapedSubreddits).toHaveLength(3);

    scrapeSubredditSpy.mockRestore();
  });
});
