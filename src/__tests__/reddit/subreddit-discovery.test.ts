/**
 * Unit tests for the subreddit discovery service.
 *
 * Tests LLM-powered subreddit suggestion, RSS validation,
 * and database persistence logic with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they can be referenced by vi.mock factories.
const { mockPrisma, mockCompleteStructured } = vi.hoisted(() => {
  const mockPrisma = {
    company: { findUnique: vi.fn() },
    trackedSubreddit: { upsert: vi.fn() },
    subredditDiscoveryLog: { create: vi.fn() },
  };
  const mockCompleteStructured = vi.fn();
  return { mockPrisma, mockCompleteStructured };
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

vi.mock("@/lib/ai/provider", () => ({
  getProvider: () => ({
    completeStructured: mockCompleteStructured,
  }),
}));

import {
  discoverSubredditsForCompany,
  validateSubreddit,
} from "@/lib/reddit/subreddit-discovery";

const mockCompany = {
  id: "company-123",
  name: "Moderna",
  industry: "Biotechnology",
  sector: "Healthcare",
  ticker: "MRNA",
  description: "Biotechnology company focused on mRNA vaccines",
};

const mockLlmResponse = {
  subreddits: [
    { name: "biotech", reason: "Industry subreddit", confidence: "high" as const },
    { name: "mrna", reason: "Ticker subreddit", confidence: "high" as const },
    { name: "moderna", reason: "Company-specific", confidence: "medium" as const },
    { name: "pharma", reason: "Pharma industry", confidence: "medium" as const },
    { name: "vaccine_research", reason: "Related field", confidence: "low" as const },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.company.findUnique.mockResolvedValue(mockCompany);
  mockPrisma.trackedSubreddit.upsert.mockResolvedValue({});
  mockPrisma.subredditDiscoveryLog.create.mockResolvedValue({});
});

describe("discoverSubredditsForCompany", () => {
  it("successfully discovers and validates subreddits", async () => {
    mockCompleteStructured.mockResolvedValue(mockLlmResponse);

    // 3 valid, 2 invalid
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (
        url.includes("/r/biotech/") ||
        url.includes("/r/mrna/") ||
        url.includes("/r/moderna/")
      ) {
        return Promise.resolve({
          status: 200,
          text: () => Promise.resolve("<feed><subtitle>245000 readers</subtitle></feed>"),
        });
      }
      return Promise.resolve({ status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await discoverSubredditsForCompany("company-123");

      expect(result.suggestedCount).toBe(5);
      expect(result.validatedCount).toBe(3);
      expect(result.status).toBe("partial");
      expect(mockPrisma.trackedSubreddit.upsert).toHaveBeenCalledTimes(3);
      expect(mockPrisma.subredditDiscoveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: "company-123",
            status: "partial",
            suggestedCount: 5,
            validatedCount: 3,
          }),
        })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skips invalid subreddits (RSS returns 404)", async () => {
    mockCompleteStructured.mockResolvedValue({
      subreddits: [
        { name: "fake_subreddit_xyz", reason: "Hallucinated", confidence: "low" as const },
        { name: "another_fake_one", reason: "Hallucinated", confidence: "low" as const },
      ],
    });

    const fetchMock = vi.fn().mockResolvedValue({ status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await discoverSubredditsForCompany("company-123");

      expect(result.suggestedCount).toBe(2);
      expect(result.validatedCount).toBe(0);
      expect(result.status).toBe("partial");
      expect(mockPrisma.trackedSubreddit.upsert).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("handles LLM failure gracefully", async () => {
    mockCompleteStructured.mockRejectedValue(new Error("LLM rate limit exceeded"));

    const result = await discoverSubredditsForCompany("company-123");

    expect(result.status).toBe("failed");
    expect(result.suggestedCount).toBe(0);
    expect(result.validatedCount).toBe(0);
    expect(result.error).toContain("LLM rate limit exceeded");
    expect(mockPrisma.subredditDiscoveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          error: expect.stringContaining("LLM rate limit exceeded"),
        }),
      })
    );
  });

  it("handles partial validation (some RSS succeed, some fail)", async () => {
    mockCompleteStructured.mockResolvedValue({
      subreddits: [
        { name: "valid_sub", reason: "Valid", confidence: "high" as const },
        { name: "invalid_sub", reason: "Invalid", confidence: "low" as const },
        { name: "another_valid", reason: "Valid", confidence: "medium" as const },
      ],
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/r/valid_sub/") || url.includes("/r/another_valid/")) {
        return Promise.resolve({
          status: 200,
          text: () => Promise.resolve("<feed></feed>"),
        });
      }
      return Promise.resolve({ status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await discoverSubredditsForCompany("company-123");

      expect(result.suggestedCount).toBe(3);
      expect(result.validatedCount).toBe(2);
      expect(result.status).toBe("partial");
      expect(mockPrisma.trackedSubreddit.upsert).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns failed status when company is not found", async () => {
    mockPrisma.company.findUnique.mockResolvedValue(null);

    const result = await discoverSubredditsForCompany("nonexistent-id");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Company not found");
    expect(mockPrisma.subredditDiscoveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          error: expect.stringContaining("Company not found"),
        }),
      })
    );
  });
});

describe("validateSubreddit", () => {
  it("returns valid for 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("<feed><subtitle>15000 readers</subtitle></feed>"),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await validateSubreddit("biotech");

      expect(result.valid).toBe(true);
      expect(result.subscriberCount).toBe(15000);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://www.reddit.com/r/biotech/.rss",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": expect.stringContaining("TheTell-Bot"),
          }),
        })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns invalid for non-200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await validateSubreddit("nonexistent_subreddit");

      expect(result.valid).toBe(false);
      expect(result.subscriberCount).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("handles timeout gracefully", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await validateSubreddit("slow_subreddit");

      expect(result.valid).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
