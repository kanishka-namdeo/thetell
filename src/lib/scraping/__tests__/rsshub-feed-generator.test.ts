import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateRsshubFeeds,
  generateGlobalRsshubFeeds,
  toFeedConfig,
  type RsshubCompanyContext,
  type RsshubFeedDef,
} from "../rsshub-feed-generator";

const DEFAULT_RSSHUB = "http://localhost:1200";

function labelsFor(feeds: RsshubFeedDef[]): string[] {
  return feeds.map((f) => f.label);
}

function urlsFor(feeds: RsshubFeedDef[]): string[] {
  return feeds.map((f) => f.url);
}

describe("generateRsshubFeeds", () => {
  const originalEnv = process.env.RSSHUB_URL;

  beforeEach(() => {
    process.env.RSSHUB_URL = DEFAULT_RSSHUB;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RSSHUB_URL;
    } else {
      process.env.RSSHUB_URL = originalEnv;
    }
  });

  describe("company with ticker", () => {
    const company: RsshubCompanyContext = {
      name: "Apple",
      ticker: "aapl",
      slug: "apple",
    };

    it("generates Finviz news feed with uppercased ticker", () => {
      const feeds = generateRsshubFeeds(company);
      const finviz = feeds.find((f) => f.label.includes("Finviz"));

      expect(finviz).toBeDefined();
      expect(finviz!.url).toBe(`${DEFAULT_RSSHUB}/finviz/news/AAPL`);
      expect(finviz!.sourceType).toBe("NEWS");
    });

    it("generates HN feeds for both company name and ticker", () => {
      const feeds = generateRsshubFeeds(company);
      const hnFeeds = feeds.filter((f) => f.label.startsWith("HN:"));

      expect(hnFeeds).toHaveLength(2);
      expect(hnFeeds[0].label).toBe("HN: Apple");
      expect(hnFeeds[0].url).toContain("q=Apple");
      expect(hnFeeds[0].sourceType).toBe("SOCIAL");

      expect(hnFeeds[1].label).toBe("HN: AAPL");
      expect(hnFeeds[1].url).toContain("q=AAPL");
    });

    it("generates Reddit feed for company name", () => {
      const feeds = generateRsshubFeeds(company);
      const reddit = feeds.find((f) => f.label.startsWith("Reddit:"));

      expect(reddit).toBeDefined();
      expect(reddit!.url).toContain("reddit.com/search.rss");
      expect(reddit!.url).toContain("q=Apple");
      expect(reddit!.sourceType).toBe("SOCIAL");
    });

    it("generates arXiv feed for AI papers (native RSS)", () => {
      const feeds = generateRsshubFeeds(company);
      const arxivFeeds = feeds.filter((f) => f.label.startsWith("arXiv:"));

      expect(arxivFeeds).toHaveLength(1);
      expect(arxivFeeds[0].label).toBe("arXiv: AI Papers");
      expect(arxivFeeds[0].url).toBe("https://rss.arxiv.org/rss/cs.AI");
    });

    it("generates Google Scholar feed for company name", () => {
      const feeds = generateRsshubFeeds(company);
      const scholar = feeds.find((f) => f.label.startsWith("Google Scholar:"));

      expect(scholar).toBeDefined();
      expect(scholar!.url).toBe(
        `${DEFAULT_RSSHUB}/google/scholar/Apple`,
      );
      expect(scholar!.sourceType).toBe("NEWS");
    });

    it("includes global feeds", () => {
      const feeds = generateRsshubFeeds(company);
      const globalLabels = labelsFor(feeds).filter((l) =>
        ["Unusual Whales", "36kr Newsflashes", "The Guardian China"].includes(l),
      );

      expect(globalLabels).toHaveLength(3);
    });
  });

  describe("tech sector company", () => {
    it("generates Bloomberg Technology feed for tech sector", () => {
      const company: RsshubCompanyContext = {
        name: "TechCorp",
        ticker: "TCOR",
        sector: "Technology",
      };

      const feeds = generateRsshubFeeds(company);
      const feedLabels = labelsFor(feeds);

      expect(feedLabels).toContain("Bloomberg Technology");
    });

    it("matches various tech sector keywords", () => {
      const techSectors = [
        "Technology",
        "Software",
        "Hardware",
        "Semiconductor",
        "Internet",
        "Information Technology",
        "Communications",
      ];

      for (const sector of techSectors) {
        const feeds = generateRsshubFeeds({
          name: "TestCo",
          ticker: "TST",
          sector,
        });
        const feedLabels = labelsFor(feeds);
        expect(feedLabels).toContain("Bloomberg Technology");
      }
    });

    it("does not generate Bloomberg Markets for tech sector", () => {
      const feeds = generateRsshubFeeds({
        name: "TechCorp",
        ticker: "TCOR",
        sector: "Technology",
      });

      expect(labelsFor(feeds)).not.toContain("Bloomberg Markets");
    });
  });

  describe("financial sector company", () => {
    it("generates Bloomberg Markets feed", () => {
      const company: RsshubCompanyContext = {
        name: "BankCorp",
        ticker: "BKCP",
        sector: "Financial Services",
      };

      const feeds = generateRsshubFeeds(company);
      expect(labelsFor(feeds)).toContain("Bloomberg Markets");
    });

    it("matches various financial sector keywords", () => {
      const financialSectors = [
        "Financial Services",
        "Banking",
        "Investment",
        "Insurance",
        "Asset Management",
        "Capital Markets",
        "Brokerage",
      ];

      for (const sector of financialSectors) {
        const feeds = generateRsshubFeeds({
          name: "FinCo",
          ticker: "FIN",
          sector,
        });
        expect(labelsFor(feeds)).toContain("Bloomberg Markets");
      }
    });

    it("does not generate Bloomberg Technology for financial sector", () => {
      const feeds = generateRsshubFeeds({
        name: "BankCorp",
        ticker: "BKCP",
        sector: "Financial Services",
      });

      expect(labelsFor(feeds)).not.toContain("Bloomberg Technology");
    });
  });

  describe("company without ticker", () => {
    const company: RsshubCompanyContext = {
      name: "Private Startup",
      ticker: null,
    };

    it("does not generate Finviz feed", () => {
      const feeds = generateRsshubFeeds(company);
      const finviz = feeds.find((f) => f.label.includes("Finviz"));

      expect(finviz).toBeUndefined();
    });

    it("does not generate ticker-based HN feed", () => {
      const feeds = generateRsshubFeeds(company);
      const hnFeeds = feeds.filter((f) => f.label.startsWith("HN:"));

      expect(hnFeeds).toHaveLength(1);
      expect(hnFeeds[0].label).toBe("HN: Private Startup");
    });

    it("still generates a single arXiv AI Papers feed regardless of ticker", () => {
      const feeds = generateRsshubFeeds(company);
      const arxivFeeds = feeds.filter((f) => f.label.startsWith("arXiv:"));

      expect(arxivFeeds).toHaveLength(1);
      expect(arxivFeeds[0].label).toBe("arXiv: AI Papers");
      expect(arxivFeeds[0].url).toBe("https://rss.arxiv.org/rss/cs.AI");
    });

    it("still generates HN feed for company name", () => {
      const feeds = generateRsshubFeeds(company);
      const hn = feeds.find((f) => f.label === "HN: Private Startup");

      expect(hn).toBeDefined();
      expect(hn!.sourceType).toBe("SOCIAL");
    });

    it("still generates Reddit feed for company name", () => {
      const feeds = generateRsshubFeeds(company);
      const reddit = feeds.find((f) => f.label.startsWith("Reddit:"));

      expect(reddit).toBeDefined();
      expect(reddit!.label).toBe("Reddit: Private Startup");
    });

    it("still generates Google Scholar feed", () => {
      const feeds = generateRsshubFeeds(company);
      const scholar = feeds.find((f) =>
        f.label.startsWith("Google Scholar:"),
      );

      expect(scholar).toBeDefined();
    });
  });

  describe("custom RSSHub base URL", () => {
    it("uses RSSHUB_URL env var when set", () => {
      process.env.RSSHUB_URL = "https://rsshub.example.com";

      const feeds = generateRsshubFeeds({ name: "Test", ticker: "TST" });
      const finviz = feeds.find((f) => f.label.includes("Finviz"));

      expect(finviz!.url).toContain("https://rsshub.example.com");
    });

    it("falls back to localhost:1200 when env var is not set", () => {
      delete process.env.RSSHUB_URL;

      const feeds = generateRsshubFeeds({ name: "Test", ticker: "TST" });
      const finviz = feeds.find((f) => f.label.includes("Finviz"));

      expect(finviz!.url).toContain("http://localhost:1200");
    });
  });
});

describe("generateGlobalRsshubFeeds", () => {
  const originalEnv = process.env.RSSHUB_URL;

  beforeEach(() => {
    process.env.RSSHUB_URL = DEFAULT_RSSHUB;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RSSHUB_URL;
    } else {
      process.env.RSSHUB_URL = originalEnv;
    }
  });

  it("returns all expected global feeds", () => {
    const feeds = generateGlobalRsshubFeeds();
    const labels = labelsFor(feeds);

    expect(labels).toContain("Unusual Whales");
    expect(labels).toContain("36kr Newsflashes");
    expect(labels).toContain("The Guardian China");
    expect(labels).not.toContain("Reuters Business");
    expect(labels).not.toContain("Reuters Markets");
    expect(labels).not.toContain("The Guardian Editorial");
  });

  it("returns exactly 3 global feeds", () => {
    const feeds = generateGlobalRsshubFeeds();
    expect(feeds).toHaveLength(3);
  });

  it("uses correct URLs for each global feed", () => {
    const feeds = generateGlobalRsshubFeeds();
    const urls = urlsFor(feeds);

    expect(urls).toContain(`${DEFAULT_RSSHUB}/unusualwhales/news`);
    expect(urls).toContain(`${DEFAULT_RSSHUB}/36kr/newsflashes`);
    expect(urls).toContain("https://www.theguardian.com/world/china/rss");
    expect(urls).not.toContain(`${DEFAULT_RSSHUB}/reuters/business`);
    expect(urls).not.toContain(`${DEFAULT_RSSHUB}/guardian/editorial`);
  });

  it("all global feeds have NEWS sourceType", () => {
    const feeds = generateGlobalRsshubFeeds();
    for (const feed of feeds) {
      expect(feed.sourceType).toBe("NEWS");
    }
  });
});

describe("toFeedConfig", () => {
  it("maps RsshubFeedDef to FeedConfig with via: rsshub", () => {
    const input: RsshubFeedDef[] = [
      {
        url: "https://example.com/feed",
        label: "Test Feed",
        sourceType: "NEWS",
      },
    ];

    const configs = toFeedConfig(input);

    expect(configs).toHaveLength(1);
    expect(configs[0]).toEqual({
      url: "https://example.com/feed",
      label: "Test Feed",
      sourceType: "NEWS",
      via: "rsshub",
    });
  });

  it("preserves all fields from input", () => {
    const input: RsshubFeedDef[] = [
      { url: "https://a.com", label: "A", sourceType: "NEWS" },
      { url: "https://b.com", label: "B", sourceType: "SOCIAL" },
    ];

    const configs = toFeedConfig(input);

    expect(configs).toHaveLength(2);
    expect(configs[0].url).toBe("https://a.com");
    expect(configs[0].label).toBe("A");
    expect(configs[1].url).toBe("https://b.com");
    expect(configs[1].sourceType).toBe("SOCIAL");
  });

  it("returns empty array for empty input", () => {
    expect(toFeedConfig([])).toEqual([]);
  });

  it("sets via to rsshub for every config", () => {
    const feeds = generateRsshubFeeds({ name: "Test", ticker: "TST" });
    const configs = toFeedConfig(feeds);

    for (const config of configs) {
      expect(config.via).toBe("rsshub");
    }
  });
});
