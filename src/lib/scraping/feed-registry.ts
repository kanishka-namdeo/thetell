/**
 * Feed registry mapping companies and sources to their RSS/Atom feed URLs.
 * Extensible configuration for passive signal discovery.
 *
 * Covers major tech, financial, healthcare, consumer, energy, telecom companies
 * plus Reddit financial subreddits for social sentiment signals.
 */

export interface CompanyFeed {
  companyId: string;
  companyName: string;
  feeds: FeedConfig[];
}

export interface FeedConfig {
  url: string;
  label: string;
  /** Override sourceType for signals from this feed (default: inferred from URL) */
  sourceType?: "NEWS" | "BLOG" | "FILING" | "TRANSCRIPT" | "SOCIAL";
}

/**
 * Registry of known company and source RSS feeds.
 * Add new companies/feeds here to expand coverage.
 */
const FEED_REGISTRY: CompanyFeed[] = [
  // ─── Technology (FAANG + major players) ──────────────────────────────────
  {
    companyId: "apple",
    companyName: "Apple",
    feeds: [
      {
        url: "https://www.apple.com/newsroom/rss/feed.rss",
        label: "Apple Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "microsoft",
    companyName: "Microsoft",
    feeds: [
      {
        url: "https://news.microsoft.com/feed/",
        label: "Microsoft Stories",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "alphabet",
    companyName: "Alphabet",
    feeds: [
      {
        url: "https://blog.google/rss/",
        label: "Google Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://abc.xyz/rss/",
        label: "Alphabet Investor News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "amazon",
    companyName: "Amazon",
    feeds: [
      {
        url: "https://www.aboutamazon.com/news/feed",
        label: "Amazon News",
        sourceType: "NEWS",
      },
      {
        url: "https://aws.amazon.com/blogs/aws/feed/",
        label: "AWS News Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "meta",
    companyName: "Meta Platforms",
    feeds: [
      {
        url: "https://about.meta.com/rss/",
        label: "Meta Newsroom",
        sourceType: "NEWS",
      },
      {
        url: "https://engineering.fb.com/feed/",
        label: "Meta Engineering Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "nvidia",
    companyName: "NVIDIA",
    feeds: [
      {
        url: "https://nvidianews.nvidia.com/releases.xml",
        label: "NVIDIA Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "tesla",
    companyName: "Tesla",
    feeds: [
      {
        url: "https://www.tesla.com/blog/feed",
        label: "Tesla Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "oracle",
    companyName: "Oracle",
    feeds: [
      {
        url: "https://www.oracle.com/news/announcement/rss-feed.xml",
        label: "Oracle Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "salesforce",
    companyName: "Salesforce",
    feeds: [
      {
        url: "https://www.salesforce.com/news/stories/feed/",
        label: "Salesforce News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "ibm",
    companyName: "IBM",
    feeds: [
      {
        url: "https://newsroom.ibm.com/rss",
        label: "IBM Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "intel",
    companyName: "Intel",
    feeds: [
      {
        url: "https://newsroom.intel.com/feed",
        label: "Intel Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "amd",
    companyName: "AMD",
    feeds: [
      {
        url: "https://community.amd.com/t5/custom/page/page-id/rss",
        label: "AMD Community",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "cisco",
    companyName: "Cisco",
    feeds: [
      {
        url: "https://newsroom.cisco.com/csr/newsroom/en/us/rss.xml",
        label: "Cisco Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "adobe",
    companyName: "Adobe",
    feeds: [
      {
        url: "https://news.adobe.com/rss/feed/",
        label: "Adobe Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "netflix",
    companyName: "Netflix",
    feeds: [
      {
        url: "https://media.netflix.com/en/press-releases.rss",
        label: "Netflix Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "samsung",
    companyName: "Samsung",
    feeds: [
      {
        url: "https://news.samsung.com/global/feed",
        label: "Samsung Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "sony",
    companyName: "Sony",
    feeds: [
      {
        url: "https://www.sony.com/en/SonyInfo/News/Press_Release/rss.xml",
        label: "Sony Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "sap",
    companyName: "SAP",
    feeds: [
      {
        url: "https://news.sap.com/feed/",
        label: "SAP News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "qualcomm",
    companyName: "Qualcomm",
    feeds: [
      {
        url: "https://www.qualcomm.com/news/releases/rss",
        label: "Qualcomm Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "paypal",
    companyName: "PayPal",
    feeds: [
      {
        url: "https://newsroom.paypal-corp.com/rss",
        label: "PayPal Newsroom",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Financial Services ──────────────────────────────────────────────────
  {
    companyId: "jpmorgan",
    companyName: "JPMorgan Chase",
    feeds: [
      {
        url: "https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/newsroom/press-releases/rss-feed.xml",
        label: "JPMorgan Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "goldman-sachs",
    companyName: "Goldman Sachs",
    feeds: [
      {
        url: "https://www.goldmansachs.com/media-rss/press-release.rss",
        label: "Goldman Sachs Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "morgan-stanley",
    companyName: "Morgan Stanley",
    feeds: [
      {
        url: "https://www.morganstanley.com/ideas/rss",
        label: "Morgan Stanley Ideas",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "bank-of-america",
    companyName: "Bank of America",
    feeds: [
      {
        url: "https://newsroom.bankofamerica.com/press-releases?pagetemplate=rss",
        label: "Bank of America Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wells-fargo",
    companyName: "Wells Fargo",
    feeds: [
      {
        url: "https://newsroom.wellsfargo.com/rss.xml",
        label: "Wells Fargo Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "citigroup",
    companyName: "Citigroup",
    feeds: [
      {
        url: "https://www.citigroup.com/global/news/press-release.rss",
        label: "Citigroup Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "berkshire-hathaway",
    companyName: "Berkshire Hathaway",
    feeds: [
      {
        url: "https://www.berkshirehathaway.com/news/news.xml",
        label: "Berkshire Hathaway News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "blackrock",
    companyName: "BlackRock",
    feeds: [
      {
        url: "https://www.blackrock.com/corporate/rss/newsroom",
        label: "BlackRock Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "visa",
    companyName: "Visa",
    feeds: [
      {
        url: "https://usa.visa.com/about-visa/newsroom/press-releases.rss",
        label: "Visa Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "mastercard",
    companyName: "Mastercard",
    feeds: [
      {
        url: "https://newsroom.mastercard.com/feed/",
        label: "Mastercard Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "american-express",
    companyName: "American Express",
    feeds: [
      {
        url: "https://newsroom.americanexpress.com/rss",
        label: "American Express Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "schwab",
    companyName: "Charles Schwab",
    feeds: [
      {
        url: "https://www.schwab.com/public/schwab/newsroom/rss",
        label: "Schwab Newsroom",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Healthcare & Pharmaceuticals ────────────────────────────────────────
  {
    companyId: "johnson-johnson",
    companyName: "Johnson & Johnson",
    feeds: [
      {
        url: "https://www.jnj.com/media-center/press-releases/rss",
        label: "J&J Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "pfizer",
    companyName: "Pfizer",
    feeds: [
      {
        url: "https://www.pfizer.com/news/press-releases/rss",
        label: "Pfizer Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "moderna",
    companyName: "Moderna",
    feeds: [
      {
        url: "https://news.modernatx.com/rss.xml",
        label: "Moderna News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "merck",
    companyName: "Merck",
    feeds: [
      {
        url: "https://www.merck.com/news/rss/",
        label: "Merck News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "abbvie",
    companyName: "AbbVie",
    feeds: [
      {
        url: "https://news.abbvie.com/rss.xml",
        label: "AbbVie News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "unitedhealth",
    companyName: "UnitedHealth Group",
    feeds: [
      {
        url: "https://news.unitedhealthgroup.com/rss",
        label: "UnitedHealth News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "roche",
    companyName: "Roche",
    feeds: [
      {
        url: "https://www.roche.com/media/releases/rss",
        label: "Roche Media Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "novartis",
    companyName: "Novartis",
    feeds: [
      {
        url: "https://www.novartis.com/news/media-releases/rss.xml",
        label: "Novartis Media Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "eli-lilly",
    companyName: "Eli Lilly",
    feeds: [
      {
        url: "https://lilly.com/news/press-releases/rss",
        label: "Eli Lilly Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "bristol-myers",
    companyName: "Bristol Myers Squibb",
    feeds: [
      {
        url: "https://news.bms.com/rss",
        label: "BMS News",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Consumer & Retail ───────────────────────────────────────────────────
  {
    companyId: "procter-gamble",
    companyName: "Procter & Gamble",
    feeds: [
      {
        url: "https://us.pg.com/news/press-releases/feed/",
        label: "P&G Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "walmart",
    companyName: "Walmart",
    feeds: [
      {
        url: "https://corporate.walmart.com/rss",
        label: "Walmart Corporate News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "costco",
    companyName: "Costco",
    feeds: [
      {
        url: "https://investor.costco.com/rss",
        label: "Costco Investor Relations",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "home-depot",
    companyName: "Home Depot",
    feeds: [
      {
        url: "https://corporate.homedepot.com/newsroom/rss",
        label: "Home Depot Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "nike",
    companyName: "Nike",
    feeds: [
      {
        url: "https://news.nike.com/feed",
        label: "Nike News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "starbucks",
    companyName: "Starbucks",
    feeds: [
      {
        url: "https://news.starbucks.com/rss",
        label: "Starbucks News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "mcdonalds",
    companyName: "McDonald's",
    feeds: [
      {
        url: "https://corporate.mcdonalds.com/corpmcd/news-and-insights/rss",
        label: "McDonald's News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "coca-cola",
    companyName: "Coca-Cola",
    feeds: [
      {
        url: "https://www.coca-colacompany.com/press-center/rss",
        label: "Coca-Cola Press Center",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "pepsico",
    companyName: "PepsiCo",
    feeds: [
      {
        url: "https://www.pepsico.com/rss/news",
        label: "PepsiCo News",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Energy & Industrial ─────────────────────────────────────────────────
  {
    companyId: "exxon-mobil",
    companyName: "ExxonMobil",
    feeds: [
      {
        url: "https://corporate.exxonmobil.com/en/news/newsroom/rss-feed",
        label: "ExxonMobil Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "chevron",
    companyName: "Chevron",
    feeds: [
      {
        url: "https://www.chevron.com/news/rss",
        label: "Chevron News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "caterpillar",
    companyName: "Caterpillar",
    feeds: [
      {
        url: "https://news.caterpillar.com/rss",
        label: "Caterpillar News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "boeing",
    companyName: "Boeing",
    feeds: [
      {
        url: "https://boeing.mediaroom.com/news-releases-statements-rss",
        label: "Boeing News Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "ge",
    companyName: "General Electric",
    feeds: [
      {
        url: "https://www.ge.com/news/press-releases/rss",
        label: "GE Press Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "3m",
    companyName: "3M",
    feeds: [
      {
        url: "https://news.3m.com/rss",
        label: "3M News",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Telecommunications ──────────────────────────────────────────────────
  {
    companyId: "att",
    companyName: "AT&T",
    feeds: [
      {
        url: "https://about.att.com/story/newsfeeds",
        label: "AT&T News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "verizon",
    companyName: "Verizon",
    feeds: [
      {
        url: "https://www.verizon.com/about/news/rss",
        label: "Verizon News",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "t-mobile",
    companyName: "T-Mobile",
    feeds: [
      {
        url: "https://www.t-mobile.com/news/press-releases.rss",
        label: "T-Mobile Press Releases",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Reddit Financial Subreddits (social sentiment signals) ──────────────
  {
    companyId: "reddit-wallstreetbets",
    companyName: "r/wallstreetbets",
    feeds: [
      {
        url: "https://www.reddit.com/r/wallstreetbets/.rss",
        label: "r/wallstreetbets",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-stocks",
    companyName: "r/stocks",
    feeds: [
      {
        url: "https://www.reddit.com/r/stocks/.rss",
        label: "r/stocks",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-investing",
    companyName: "r/investing",
    feeds: [
      {
        url: "https://www.reddit.com/r/investing/.rss",
        label: "r/investing",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-economy",
    companyName: "r/economy",
    feeds: [
      {
        url: "https://www.reddit.com/r/economy/.rss",
        label: "r/economy",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-markets",
    companyName: "r/markets",
    feeds: [
      {
        url: "https://www.reddit.com/r/markets/.rss",
        label: "r/markets",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-stockmarket",
    companyName: "r/stockmarket",
    feeds: [
      {
        url: "https://www.reddit.com/r/stockmarket/.rss",
        label: "r/stockmarket",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-options",
    companyName: "r/options",
    feeds: [
      {
        url: "https://www.reddit.com/r/options/.rss",
        label: "r/options",
        sourceType: "SOCIAL",
      },
    ],
  },
  {
    companyId: "reddit-dividends",
    companyName: "r/dividends",
    feeds: [
      {
        url: "https://www.reddit.com/r/dividends/.rss",
        label: "r/dividends",
        sourceType: "SOCIAL",
      },
    ],
  },
];

/**
 * Get all registered company feeds.
 */
export function getAllFeeds(): CompanyFeed[] {
  return FEED_REGISTRY;
}

/**
 * Get feeds for a specific company by ID (case-insensitive match).
 */
export function getFeedsByCompanyId(companyId: string): CompanyFeed | undefined {
  return FEED_REGISTRY.find(
    (cf) => cf.companyId.toLowerCase() === companyId.toLowerCase()
  );
}

/**
 * Get feeds for a specific company by name (case-insensitive match).
 */
export function getFeedsByCompanyName(companyName: string): CompanyFeed | undefined {
  return FEED_REGISTRY.find(
    (cf) => cf.companyName.toLowerCase() === companyName.toLowerCase()
  );
}

/**
 * Get all feed URLs across all companies (flat list).
 */
export function getAllFeedUrls(): { url: string; label: string; companyName: string; companyId: string }[] {
  const result: { url: string; label: string; companyName: string; companyId: string }[] = [];
  for (const company of FEED_REGISTRY) {
    for (const feed of company.feeds) {
      result.push({
        url: feed.url,
        label: feed.label,
        companyName: company.companyName,
        companyId: company.companyId,
      });
    }
  }
  return result;
}

/**
 * Look up which company a feed URL belongs to.
 */
export function getCompanyByFeedUrl(feedUrl: string): CompanyFeed | undefined {
  return FEED_REGISTRY.find((cf) =>
    cf.feeds.some((f) => f.url === feedUrl)
  );
}

/**
 * Get all feeds of a specific source type.
 */
export function getFeedsBySourceType(sourceType: FeedConfig["sourceType"]): CompanyFeed[] {
  return FEED_REGISTRY.filter((cf) =>
    cf.feeds.some((f) => f.sourceType === sourceType)
  );
}

/**
 * Get the total number of registered feeds across all companies.
 */
export function getTotalFeedCount(): number {
  return FEED_REGISTRY.reduce((total, cf) => total + cf.feeds.length, 0);
}
