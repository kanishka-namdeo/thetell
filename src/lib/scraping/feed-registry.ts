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
  /** Marks feed as routed through self-hosted RSSHub instance */
  via?: "rsshub";
}

/**
 * CIK numbers for major US-listed companies.
 * Used to generate per-company SEC EDGAR filing feeds.
 */
const CIK_MAP: Record<string, string | null> = {
  apple: "0000320193",
  microsoft: "0000789019",
  alphabet: "0001652044",
  amazon: "0001018724",
  meta: "0001326801",
  nvidia: "0001045810",
  tesla: "0001318605",
  "johnson-johnson": "0000206252",
  pfizer: "0000078003",
  "eli-lilly": "0000059476",
  jpmorgan: "0000019617",
  "goldman-sachs": "0000886982",
  "bank-of-america": "0000070858",
  "wells-fargo": "0000072971",
  "berkshire-hathaway": "0001067983",
  blackrock: "0001364742",
  visa: "0001403161",
  mastercard: "0001141391",
  "exxon-mobil": "0000034088",
  chevron: "0000093410",
  boeing: "0000012927",
  "procter-gamble": "0000080424",
  walmart: "0000104169",
  costco: "0000909832",
  netflix: "0001065280",
  adobe: "0000796343",
  salesforce: "0001108524",
  ibm: "0000051143",
  intel: "0000050863",
  amd: "0000002488",
  cisco: "0000858877",
  oracle: "0001341439",
  paypal: "0001633917",
  "morgan-stanley": "0000895421",
  citigroup: "0000831001",
  unitedhealth: "0000731766",
  merck: "0000310158",
  moderna: "0001682852",
  abbvie: "0001551152",
  samsung: "0001603296",
  sony: "0000940034",
  spotify: "0001639920",
  uber: "0001543151",
  airbnb: "0001559720",
  stripe: null,
  shopify: "0001599901",
  palantir: "0001321655",
  snowflake: "0001640147",
  crowdstrike: "0001535527",
  databricks: null,
  cloudflare: "0001990664",
  datadog: "0001567679",
  hashicorp: "0001409493",
  mongodb: "0001447028",
  servicenow: "0001373715",
  twilio: "0001447596",
  openai: null,
  huggingface: null,
  "google-deepmind": null,
  vercel: null,
  supabase: null,
  github: null,
  "product-hunt": null,
};

/**
 * Generate SEC EDGAR per-company filing feeds from CIK map.
 * Returns feeds for 8-K (current reports) and 10-K (annual reports).
 */
function getSecEdgarFeeds(companyId: string): FeedConfig[] {
  const cik = CIK_MAP[companyId];
  if (!cik) return [];

  return [
    {
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&count=40&output=atom`,
      label: "SEC EDGAR 8-K Filings",
      sourceType: "FILING",
    },
    {
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&count=40&output=atom`,
      label: "SEC EDGAR 10-K Filings",
      sourceType: "FILING",
    },
  ];
}

/**
 * Augment a company's feeds with SEC EDGAR filing feeds if a CIK is available.
 */
function augmentWithSecFeeds(feeds: CompanyFeed): CompanyFeed {
  const secFeeds = getSecEdgarFeeds(feeds.companyId);
  if (secFeeds.length === 0) return feeds;
  return { ...feeds, feeds: [...feeds.feeds, ...secFeeds] };
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
        url: "https://rss.applemarketingtools.com/api/v2/us/apps/top-free/50/rss.json",
        label: "Apple App Store Top Free",
        sourceType: "NEWS",
      },
      {
        url: "https://www.apple.com/newsroom/rss-feed.rss",
        label: "Apple Newsroom",
        sourceType: "NEWS",
      },
      {
        url: "https://developer.apple.com/news/rss/news.rss",
        label: "Apple Developer",
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
        label: "Microsoft News",
        sourceType: "NEWS",
      },
      {
        url: "https://blogs.microsoft.com/feed/",
        label: "Microsoft Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://devblogs.microsoft.com/feed/",
        label: "Microsoft Developer Blogs",
        sourceType: "BLOG",
      },
      {
        url: "https://azure.microsoft.com/en-us/blog/feed/",
        label: "Azure Blog",
        sourceType: "BLOG",
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
      {
        url: "https://blog.google/technology/ai/rss/",
        label: "Google AI Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://blog.youtube/rss/",
        label: "YouTube Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://cloudblog.withgoogle.com/rss/",
        label: "Google Cloud Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://abc.xyz/investor/static/content/rss/news.xml",
        label: "Alphabet Investor Relations",
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
      {
        url: "https://aws.amazon.com/blogs/compute/feed/",
        label: "AWS Compute Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://www.amazon.science/rss",
        label: "Amazon Science",
        sourceType: "BLOG",
      },
      {
        url: "https://ir.aboutamazon.com/rss.xml",
        label: "Amazon Investor Relations",
        sourceType: "NEWS",
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
      {
        url: "https://ai.meta.com/blog/rss/",
        label: "Meta AI Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://investor.fb.com/rss.xml",
        label: "Meta Investor Relations",
        sourceType: "NEWS",
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
      {
        url: "https://blogs.nvidia.com/feed/",
        label: "NVIDIA Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://developer.nvidia.com/blog/feed",
        label: "NVIDIA Developer",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "tesla",
    companyName: "Tesla",
    feeds: [
      {
        url: "https://ir.tesla.com/rss.xml",
        label: "Tesla Investor Relations",
        sourceType: "NEWS",
      },
      {
        url: "https://www.tesla.com/blog/feed",
        label: "Tesla Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "broadcom",
    companyName: "Broadcom",
    feeds: [
      {
        url: "https://investors.broadcom.com/rss.xml",
        label: "Broadcom Investor Relations",
        sourceType: "NEWS",
      },
      {
        url: "https://www.broadcom.com/company/news/rss",
        label: "Broadcom News",
        sourceType: "NEWS",
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
      {
        url: "https://blogs.oracle.com/blog/rss",
        label: "Oracle Blog",
        sourceType: "BLOG",
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
      {
        url: "https://engineering.salesforce.com/feed/",
        label: "Salesforce Engineering Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://developer.salesforce.com/blogs/feed",
        label: "Salesforce Developer Blog",
        sourceType: "BLOG",
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
      {
        url: "https://research.ibm.com/blog/rss",
        label: "IBM Research Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.intel.com/content/www/us/en/developer/blog/rss.xml",
        label: "Intel Developer Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "amd",
    companyName: "AMD",
    feeds: [
      {
        url: "https://ir.amd.com/news-events/press-releases/rss",
        label: "AMD Press Releases",
        sourceType: "NEWS",
      },
      {
        url: "https://community.amd.com/t5/custom/page/rss",
        label: "AMD Community Blog",
        sourceType: "BLOG",
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
      {
        url: "https://blogs.cisco.com/feed",
        label: "Cisco Blog",
        sourceType: "BLOG",
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
      {
        url: "https://blog.adobe.com/en/publish/rss.xml",
        label: "Adobe Blog",
        sourceType: "BLOG",
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
      {
        url: "https://netflixtechblog.com/feed",
        label: "Netflix Tech Blog",
        sourceType: "BLOG",
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
      {
        url: "https://developer.samsung.com/rss/rss.xml",
        label: "Samsung Developer",
        sourceType: "BLOG",
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
      {
        url: "https://www.sony.com/en/SonyInfo/blog/rss.xml",
        label: "Sony Blog",
        sourceType: "BLOG",
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
      {
        url: "https://community.sap.com/khhcv55317/rss/board",
        label: "SAP Community",
        sourceType: "BLOG",
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
      {
        url: "https://www.qualcomm.com/developer/blog/feed",
        label: "Qualcomm Developer Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.paypal.com/us/business/blog/rss",
        label: "PayPal Business Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.jpmorgan.com/insights/rss",
        label: "JPMorgan Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.goldmansachs.com/insights/rss",
        label: "Goldman Sachs Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.morganstanley.com/rss/news.xml",
        label: "Morgan Stanley News",
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
      {
        url: "https://www.bankofamerica.com/insights/rss/",
        label: "Bank of America Insights",
        sourceType: "BLOG",
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
      {
        url: "https://connect.wellsfargo.com/rss.xml",
        label: "Wells Fargo Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.citi.com/insights/rss",
        label: "Citi Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.blackrock.com/corporate/rss/insights",
        label: "BlackRock Insights",
        sourceType: "BLOG",
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
      {
        url: "https://blogs.visa.com/feed/",
        label: "Visa Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.mastercard.com/news/eu/en/feed/",
        label: "Mastercard Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.americanexpress.com/en-us/insights/feed/",
        label: "American Express Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.schwab.com/learn/story/insights/rss",
        label: "Schwab Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.jnj.com/rss",
        label: "J&J News",
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
      {
        url: "https://www.pfizer.com/news/rss",
        label: "Pfizer News",
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
      {
        url: "https://www.modernatx.com/rss",
        label: "Moderna Updates",
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
      {
        url: "https://www.merck.com/blog/rss/",
        label: "Merck Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.abbvie.com/rss",
        label: "AbbVie Updates",
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
      {
        url: "https://www.unitedhealthgroup.com/content/dam/uhg/rss/rss.xml",
        label: "UnitedHealth Insights",
        sourceType: "BLOG",
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
      {
        url: "https://www.roche.com/rss",
        label: "Roche News",
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
      {
        url: "https://www.novartis.com/rss",
        label: "Novartis News",
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
      {
        url: "https://lilly.com/rss",
        label: "Eli Lilly News",
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
      {
        url: "https://www.bms.com/rss",
        label: "BMS Updates",
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
      {
        url: "https://us.pg.com/feed/",
        label: "P&G News",
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
      {
        url: "https://tech.walmart.com/feed/",
        label: "Walmart Tech Blog",
        sourceType: "BLOG",
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
      {
        url: "https://www.costco.com/rss",
        label: "Costco News",
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
      {
        url: "https://corporate.homedepot.com/rss",
        label: "Home Depot News",
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
      {
        url: "https://www.nike.com/rss",
        label: "Nike Updates",
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
      {
        url: "https://www.starbucks.com/blog/feed",
        label: "Starbucks Blog",
        sourceType: "BLOG",
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
      {
        url: "https://corporate.mcdonalds.com/rss",
        label: "McDonald's Updates",
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
      {
        url: "https://www.coca-colacompany.com/rss",
        label: "Coca-Cola News",
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
      {
        url: "https://www.pepsico.com/rss",
        label: "PepsiCo Updates",
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
      {
        url: "https://corporate.exxonmobil.com/rss",
        label: "ExxonMobil Updates",
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
      {
        url: "https://www.chevron.com/rss",
        label: "Chevron Updates",
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
      {
        url: "https://www.caterpillar.com/en/news/rss.html",
        label: "Caterpillar Updates",
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
      {
        url: "https://www.boeing.com/rss",
        label: "Boeing Updates",
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
      {
        url: "https://www.ge.com/rss",
        label: "GE News",
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
      {
        url: "https://www.3m.com/rss",
        label: "3M Updates",
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
      {
        url: "https://about.att.com/rss",
        label: "AT&T Updates",
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
      {
        url: "https://www.verizon.com/about/rss",
        label: "Verizon Updates",
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
      {
        url: "https://www.t-mobile.com/rss",
        label: "T-Mobile News",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Additional Technology ────────────────────────────────────────────────
  {
    companyId: "github",
    companyName: "GitHub",
    feeds: [
      {
        url: "https://github.blog/feed/",
        label: "GitHub Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://github.blog/changelog/feed/",
        label: "GitHub Changelog",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "vercel",
    companyName: "Vercel",
    feeds: [
      {
        url: "https://vercel.com/atom",
        label: "Vercel Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "supabase",
    companyName: "Supabase",
    feeds: [
      {
        url: "https://supabase.com/rss.xml",
        label: "Supabase Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "shopify",
    companyName: "Shopify",
    feeds: [
      {
        url: "https://www.shopify.com/news/feed",
        label: "Shopify News",
        sourceType: "NEWS",
      },
      {
        url: "https://shopify.engineering/rss",
        label: "Shopify Engineering",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "servicenow",
    companyName: "ServiceNow",
    feeds: [
      {
        url: "https://www.servicenow.com/content/dam/servicenow-assets/public/en-us/doc-type/rss/rss-newsroom.xml",
        label: "ServiceNow Newsroom",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "snowflake",
    companyName: "Snowflake",
    feeds: [
      {
        url: "https://www.snowflake.com/blog/feed/",
        label: "Snowflake Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "palantir",
    companyName: "Palantir",
    feeds: [
      {
        url: "https://www.palantir.com/feed/",
        label: "Palantir Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "crowdstrike",
    companyName: "CrowdStrike",
    feeds: [
      {
        url: "https://www.crowdstrike.com/blog/feed/",
        label: "CrowdStrike Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "uber",
    companyName: "Uber",
    feeds: [
      {
        url: "https://www.uber.com/blog/feed/",
        label: "Uber Blog",
        sourceType: "BLOG",
      },
      {
        url: "https://eng.uber.com/feed/",
        label: "Uber Engineering",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "airbnb",
    companyName: "Airbnb",
    feeds: [
      {
        url: "https://www.airbnb.com/newsroom/rss",
        label: "Airbnb Newsroom",
        sourceType: "NEWS",
      },
      {
        url: "https://medium.com/feed/airbnb-engineering",
        label: "Airbnb Engineering",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "stripe",
    companyName: "Stripe",
    feeds: [
      {
        url: "https://stripe.com/blog/feed.rss",
        label: "Stripe Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "databricks",
    companyName: "Databricks",
    feeds: [
      {
        url: "https://www.databricks.com/blog/feed",
        label: "Databricks Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "hashicorp",
    companyName: "HashiCorp",
    feeds: [
      {
        url: "https://www.hashicorp.com/blog/feed.xml",
        label: "HashiCorp Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "mongodb",
    companyName: "MongoDB",
    feeds: [
      {
        url: "https://www.mongodb.com/blog/rss",
        label: "MongoDB Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "cloudflare",
    companyName: "Cloudflare",
    feeds: [
      {
        url: "https://blog.cloudflare.com/rss/",
        label: "Cloudflare Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "datadog",
    companyName: "Datadog",
    feeds: [
      {
        url: "https://www.datadoghq.com/blog/feed/",
        label: "Datadog Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "twilio",
    companyName: "Twilio",
    feeds: [
      {
        url: "https://www.twilio.com/blog/feed",
        label: "Twilio Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "spotify",
    companyName: "Spotify",
    feeds: [
      {
        url: "https://newsroom.spotify.com/feed/",
        label: "Spotify Newsroom",
        sourceType: "NEWS",
      },
      {
        url: "https://engineering.atspotify.com/feed/",
        label: "Spotify Engineering",
        sourceType: "BLOG",
      },
    ],
  },

  // ─── Industry / Regulatory Feeds ────────────────────────────────────────
  {
    companyId: "sec-edgar",
    companyName: "SEC EDGAR",
    feeds: [
      {
        url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K&dateb=&owner=include&count=40&search_text=&action=getcompany&rss",
        label: "SEC EDGAR 10-K Filings",
        sourceType: "FILING",
      },
    ],
  },
  {
    companyId: "federal-reserve",
    companyName: "Federal Reserve",
    feeds: [
      {
        url: "https://www.federalreserve.gov/feeds/press_all.xml",
        label: "Federal Reserve Press",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "bureau-labor-stats",
    companyName: "Bureau of Labor Statistics",
    feeds: [
      {
        url: "https://www.bls.gov/feed/bls_latest.rss",
        label: "BLS Latest Releases",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "techcrunch",
    companyName: "TechCrunch",
    feeds: [
      {
        url: "https://techcrunch.com/feed/",
        label: "TechCrunch",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "the-information",
    companyName: "The Information",
    feeds: [
      {
        url: "https://www.theinformation.com/feed",
        label: "The Information",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "stratechery",
    companyName: "Stratechery",
    feeds: [
      {
        url: "https://stratechery.com/feed/",
        label: "Stratechery",
        sourceType: "BLOG",
      },
    ],
  },

  // ─── Tech Media & News ────────────────────────────────────────────────────
  {
    companyId: "the-verge",
    companyName: "The Verge",
    feeds: [
      {
        url: "https://www.theverge.com/rss/index.xml",
        label: "The Verge",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wired",
    companyName: "Wired",
    feeds: [
      {
        url: "https://www.wired.com/feed/rss",
        label: "Wired",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "ars-technica",
    companyName: "Ars Technica",
    feeds: [
      {
        url: "https://feeds.arstechnica.com/arstechnica/index",
        label: "Ars Technica",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "mit-tech-review",
    companyName: "MIT Technology Review",
    feeds: [
      {
        url: "https://www.technologyreview.com/feed/",
        label: "MIT Technology Review",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "product-hunt",
    companyName: "Product Hunt",
    feeds: [
      {
        url: "https://www.producthunt.com/feed",
        label: "Product Hunt",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "the-hacker-news",
    companyName: "The Hacker News",
    feeds: [
      {
        url: "https://feeds.feedburner.com/TheHackersNews",
        label: "The Hacker News",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── Government & Cybersecurity ───────────────────────────────────────────
  {
    companyId: "cisa",
    companyName: "CISA",
    feeds: [
      {
        url: "https://www.cisa.gov/news.xml",
        label: "CISA Cybersecurity Alerts",
        sourceType: "NEWS",
      },
    ],
  },

  // ─── AI & Research ────────────────────────────────────────────────────────
  {
    companyId: "openai",
    companyName: "OpenAI",
    feeds: [
      {
        url: "https://openai.com/news/rss.xml",
        label: "OpenAI Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "google-deepmind",
    companyName: "Google DeepMind",
    feeds: [
      {
        url: "https://deepmind.google/blog/rss.xml",
        label: "Google DeepMind Blog",
        sourceType: "BLOG",
      },
    ],
  },
  {
    companyId: "huggingface",
    companyName: "Hugging Face",
    feeds: [
      {
        url: "https://huggingface.co/blog/feed.xml",
        label: "Hugging Face Blog",
        sourceType: "BLOG",
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

  // ─── Wikipedia Article History ────────────────────────────────────────
  {
    companyId: "wikipedia-apple",
    companyName: "Apple (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Apple_Inc.&action=history&feed=rss",
        label: "Wikipedia: Apple Inc.",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-microsoft",
    companyName: "Microsoft (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Microsoft&action=history&feed=rss",
        label: "Wikipedia: Microsoft",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-alphabet",
    companyName: "Alphabet (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Alphabet_Inc.&action=history&feed=rss",
        label: "Wikipedia: Alphabet Inc.",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-amazon",
    companyName: "Amazon (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Amazon_(company)&action=history&feed=rss",
        label: "Wikipedia: Amazon (company)",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-meta",
    companyName: "Meta (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Meta_Platforms&action=history&feed=rss",
        label: "Wikipedia: Meta Platforms",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-nvidia",
    companyName: "NVIDIA (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Nvidia&action=history&feed=rss",
        label: "Wikipedia: Nvidia",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-tesla",
    companyName: "Tesla (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Tesla,_Inc.&action=history&feed=rss",
        label: "Wikipedia: Tesla, Inc.",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-netflix",
    companyName: "Netflix (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Netflix&action=history&feed=rss",
        label: "Wikipedia: Netflix",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-samsung",
    companyName: "Samsung (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Samsung&action=history&feed=rss",
        label: "Wikipedia: Samsung",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-sony",
    companyName: "Sony (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Sony&action=history&feed=rss",
        label: "Wikipedia: Sony",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-ibm",
    companyName: "IBM (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=IBM&action=history&feed=rss",
        label: "Wikipedia: IBM",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-intel",
    companyName: "Intel (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Intel&action=history&feed=rss",
        label: "Wikipedia: Intel",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-oracle",
    companyName: "Oracle (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Oracle_Corporation&action=history&feed=rss",
        label: "Wikipedia: Oracle Corporation",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-adobe",
    companyName: "Adobe (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Adobe_Inc.&action=history&feed=rss",
        label: "Wikipedia: Adobe Inc.",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-salesforce",
    companyName: "Salesforce (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Salesforce&action=history&feed=rss",
        label: "Wikipedia: Salesforce",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-boeing",
    companyName: "Boeing (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Boeing&action=history&feed=rss",
        label: "Wikipedia: Boeing",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-walmart",
    companyName: "Walmart (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Walmart&action=history&feed=rss",
        label: "Wikipedia: Walmart",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-jpmorgan",
    companyName: "JPMorgan (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=JPMorgan_Chase&action=history&feed=rss",
        label: "Wikipedia: JPMorgan Chase",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-goldman-sachs",
    companyName: "Goldman Sachs (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Goldman_Sachs&action=history&feed=rss",
        label: "Wikipedia: Goldman Sachs",
        sourceType: "NEWS",
      },
    ],
  },
  {
    companyId: "wikipedia-berkshire-hathaway",
    companyName: "Berkshire Hathaway (Wikipedia)",
    feeds: [
      {
        url: "https://en.wikipedia.org/w/index.php?title=Berkshire_Hathaway&action=history&feed=rss",
        label: "Wikipedia: Berkshire Hathaway",
        sourceType: "NEWS",
      },
    ],
  },
];

/**
 * Get all registered company feeds.
 */
export function getAllFeeds(): CompanyFeed[] {
  return FEED_REGISTRY.map(augmentWithSecFeeds);
}

/**
 * Get feeds for a specific company by ID (case-insensitive match).
 */
export function getFeedsByCompanyId(companyId: string): CompanyFeed | undefined {
  const found = FEED_REGISTRY.find(
    (cf) => cf.companyId.toLowerCase() === companyId.toLowerCase()
  );
  return found ? augmentWithSecFeeds(found) : undefined;
}

/**
 * Get feeds for a specific company by name (fuzzy match).
 * Handles variations like "Apple" vs "Apple Inc."
 */
export function getFeedsByCompanyName(companyName: string): CompanyFeed | undefined {
  const normalized = companyName.toLowerCase().replace(/\s+(inc\.?|corp\.?|ltd\.?|llc)$/i, '').trim();
  
  const found = FEED_REGISTRY.find((cf) => {
    const registryName = cf.companyName.toLowerCase().replace(/\s+(inc\.?|corp\.?|ltd\.?|llc)$/i, '').trim();
    return registryName === normalized || registryName.includes(normalized) || normalized.includes(registryName);
  });
  return found ? augmentWithSecFeeds(found) : undefined;
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
 * Get all company slugs from the feed registry.
 * Useful for validation and debugging.
 */
export function getAllCompanySlugs(): string[] {
  return FEED_REGISTRY.map(cf => cf.companyId);
}

/**
 * Check if a company slug exists in the feed registry.
 */
export function hasFeedForSlug(slug: string): boolean {
  return FEED_REGISTRY.some(cf => cf.companyId.toLowerCase() === slug.toLowerCase());
}

/**
 * Get the total number of registered feeds across all companies.
 */
export function getTotalFeedCount(): number {
  return FEED_REGISTRY.reduce((total, cf) => total + cf.feeds.length, 0);
}

// ─── Database-backed feed functions ──────────────────────────────────────────

import { prisma } from "@/lib/db";

/**
 * Get all company feeds from the database.
 * Returns feeds in the same CompanyFeed format as the hardcoded registry.
 */
export async function getAllFeedsFromDB(): Promise<CompanyFeed[]> {
  const dataSources = await prisma.companyDataSource.findMany({
    where: { isActive: true },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  // Group by companyId
  const grouped = new Map<string, CompanyFeed>();

  for (const ds of dataSources) {
    if (!grouped.has(ds.companyId)) {
      grouped.set(ds.companyId, {
        companyId: ds.companyId,
        companyName: ds.company.name,
        feeds: [],
      });
    }

    const companyFeed = grouped.get(ds.companyId)!;
    companyFeed.feeds.push({
      url: ds.url,
      label: ds.label || `${ds.sourceType} Feed`,
      sourceType: ds.sourceType as "NEWS" | "BLOG" | "FILING" | "TRANSCRIPT" | "SOCIAL",
    });
  }

  return Array.from(grouped.values());
}

/**
 * Get feeds for a specific company from the database.
 */
export async function getFeedsFromDBByCompanyId(companyId: string): Promise<CompanyFeed | null> {
  const dataSources = await prisma.companyDataSource.findMany({
    where: { companyId, isActive: true },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  if (dataSources.length === 0) return null;

  return {
    companyId: dataSources[0].companyId,
    companyName: dataSources[0].company.name,
    feeds: dataSources.map(ds => ({
      url: ds.url,
      label: ds.label || `${ds.sourceType} Feed`,
      sourceType: ds.sourceType as "NEWS" | "BLOG" | "FILING" | "TRANSCRIPT" | "SOCIAL",
    })),
  };
}
