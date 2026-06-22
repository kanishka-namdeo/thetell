/**
 * Centralized scraper registry for managing all available scrapers.
 * Provides configuration, enablement status, and API key requirements.
 */

import { GitHubScraper } from "./github-scraper";
import { CertTransparencyScraper } from "./cert-transparency-scraper";
import { RedditFinancialScraper } from "./reddit-financial-scraper";
import { PressReleaseScraper } from "./press-release-scraper";
import { UspScraper } from "./uspto-scraper";
import { CourtListenerScraper } from "./courtlistener-scraper";
import { FdaScraper } from "./fda-scraper";
import { SamScraper } from "./sam-scraper";
import { WaybackScraper } from "./wayback-scraper";
import { CongressScraper } from "./congress-scraper";
import { AcademicScraper } from "./academic-scraper";
import { RssScraper } from "./rss-scraper";
import { FilingScraper } from "./filing-scraper";
import { BlogScraper } from "./blog-scraper";
import { SocialScraper } from "./social-scraper";
import { JobPostingScraper } from "./job-scraper";
import { TranscriptScraper } from "./transcript-scraper";
import { NewsScraper } from "./news-scraper";
import { LobbyingScraper } from "./lobbying-scraper";
import { SupplierEarningScraper } from "./supplier-earning-scraper";
import { ExecutiveAppearanceScraper } from "./exec-appearance-scraper";
import { AppStoreTracker } from "./appstore-tracker";
import { DomainTracker } from "./domain-tracker";
import { ConferenceAgendaScraper } from "./conference-agenda-scraper";
import { AppStoreScraper } from "./app-store-scraper";
import { ConferenceScraper } from "./conference-scraper";
import { WebSearchScraper } from "./web-search-scraper";

export interface ScraperConfig {
  enabled: boolean;
  config: Record<string, string | undefined>;
}

export interface ScraperEntry<T> {
  scraper: T;
  enabled: boolean;
  config: Record<string, string | undefined>;
}

/**
 * Get all available scrapers with their configuration.
 * Scrapers requiring API keys are disabled if keys are not configured.
 */
export function getAllScrapers() {
  return [
    // RSS and feed-based scrapers (no API key required)
    {
      scraper: new RssScraper(),
      enabled: true,
      config: {},
    },
    {
      scraper: new FilingScraper(),
      enabled: true,
      config: {},
    },
    {
      scraper: new BlogScraper(),
      enabled: true,
      config: {},
    },
    {
      scraper: new SocialScraper(),
      enabled: true,
      config: {},
    },
    {
      scraper: new JobPostingScraper(),
      enabled: true,
      config: {},
    },
    {
      scraper: new TranscriptScraper(),
      enabled: true,
      config: {},
    },
    {
      scraper: new NewsScraper(),
      enabled: true,
      config: {},
    },

    // GitHub scraper (optional token for higher rate limits)
    {
      scraper: new GitHubScraper(),
      enabled: true,
      config: {
        githubToken: process.env.GITHUB_TOKEN,
      },
    },

    // Certificate transparency (no API key required)
    {
      scraper: new CertTransparencyScraper(),
      enabled: true,
      config: {},
    },

    // Reddit financial scraper (no API key required)
    {
      scraper: new RedditFinancialScraper(),
      enabled: true,
      config: {},
    },

    // Press release wires (no API key required)
    {
      scraper: new PressReleaseScraper(),
      enabled: true,
      config: {},
    },

    // USPTO patent scraper (requires API key)
    {
      scraper: new UspScraper(),
      enabled: !!process.env.USPTO_API_KEY,
      config: {
        apiKey: process.env.USPTO_API_KEY,
      },
    },

    // CourtListener litigation scraper (requires API key)
    {
      scraper: new CourtListenerScraper(),
      enabled: !!process.env.COURT_LISTENER_API_KEY,
      config: {
        apiKey: process.env.COURT_LISTENER_API_KEY,
      },
    },

    // FDA scraper (no API key required)
    {
      scraper: new FdaScraper(),
      enabled: true,
      config: {},
    },

    // SAM.gov contract scraper (requires API key)
    {
      scraper: new SamScraper(),
      enabled: !!process.env.SAM_API_KEY,
      config: {
        apiKey: process.env.SAM_API_KEY,
      },
    },

    // Wayback Machine scraper (no API key required)
    {
      scraper: new WaybackScraper(),
      enabled: true,
      config: {},
    },

    // Congress.gov scraper (requires API key)
    {
      scraper: new CongressScraper(),
      enabled: !!process.env.CONGRESS_API_KEY,
      config: {
        apiKey: process.env.CONGRESS_API_KEY,
      },
    },

    // Academic paper scraper (no API key required)
    {
      scraper: new AcademicScraper(),
      enabled: true,
      config: {},
    },

    // Lobbying disclosure scraper (no API key required)
    {
      scraper: new LobbyingScraper(),
      enabled: true,
      config: {},
    },
    // Supplier earnings scraper (no API key required)
    {
      scraper: new SupplierEarningScraper(),
      enabled: true,
      config: {},
    },
    // Executive appearance scraper (no API key required)
    {
      scraper: new ExecutiveAppearanceScraper(),
      enabled: true,
      config: {},
    },
    // App Store tracker (no API key required)
    {
      scraper: new AppStoreTracker(),
      enabled: true,
      config: {},
    },
    // Domain registration tracker (no API key required)
    {
      scraper: new DomainTracker(),
      enabled: true,
      config: {},
    },
    // Conference agenda scraper (no API key required)
    {
      scraper: new ConferenceAgendaScraper(),
      enabled: true,
      config: {},
    },
    // App Store RSS scraper (no API key required)
    {
      scraper: new AppStoreScraper(),
      enabled: true,
      config: {},
    },
    // Conference agenda scraper v2 (no API key required)
    {
      scraper: new ConferenceScraper(),
      enabled: true,
      config: {},
    },
    // Web search scraper (Brave Search API primary, DuckDuckGo fallback)
    // Always enabled: uses DuckDuckGo if Brave key not configured
    {
      scraper: new WebSearchScraper(),
      enabled: true,
      config: {
        braveApiKey: process.env.BRAVE_API_KEY,
      },
    },
  ];
}

/**
 * Get only enabled scrapers.
 */
export function getEnabledScrapers() {
  return getAllScrapers().filter((entry) => entry.enabled);
}

/**
 * Get scrapers that require API keys (for diagnostics).
 */
export function getApiKeyRequiredScrapers() {
  return [
    { name: "USPTO", envVar: "USPTO_API_KEY", configured: !!process.env.USPTO_API_KEY },
    { name: "CourtListener", envVar: "COURT_LISTENER_API_KEY", configured: !!process.env.COURT_LISTENER_API_KEY },
    { name: "SAM.gov", envVar: "SAM_API_KEY", configured: !!process.env.SAM_API_KEY },
    { name: "Congress.gov", envVar: "CONGRESS_API_KEY", configured: !!process.env.CONGRESS_API_KEY },
    { name: "Brave Search", envVar: "BRAVE_API_KEY", configured: !!process.env.BRAVE_API_KEY, note: "Optional - falls back to DuckDuckGo" },
  ];
}
