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
import { StealthBrowserScraper } from "./stealth-browser-scraper";
import { MastodonScraper } from "./mastodon-scraper";
import { TwitterScraper } from "./twitter-scraper";

export interface ScraperConfig {
  enabled: boolean;
  config: Record<string, string | undefined>;
}

export interface ScraperEntry<T> {
  scraper: T;
  enabled: boolean;
  config: Record<string, string | undefined>;
}

// Cached scraper instances to avoid re-allocating on every call
const scraperInstances = {
  rss: new RssScraper(),
  filing: new FilingScraper(),
  blog: new BlogScraper(),
  social: new SocialScraper(),
  jobPosting: new JobPostingScraper(),
  transcript: new TranscriptScraper(),
  news: new NewsScraper(),
  github: new GitHubScraper(),
  certTransparency: new CertTransparencyScraper(),
  redditFinancial: new RedditFinancialScraper(),
  pressRelease: new PressReleaseScraper(),
  uspto: new UspScraper(),
  courtListener: new CourtListenerScraper(),
  fda: new FdaScraper(),
  sam: new SamScraper(),
  wayback: new WaybackScraper(),
  congress: new CongressScraper(),
  academic: new AcademicScraper(),
  lobbying: new LobbyingScraper(),
  supplierEarning: new SupplierEarningScraper(),
  execAppearance: new ExecutiveAppearanceScraper(),
  appStoreTracker: new AppStoreTracker(),
  domainTracker: new DomainTracker(),
  conferenceAgenda: new ConferenceAgendaScraper(),
  appStore: new AppStoreScraper(),
  conference: new ConferenceScraper(),
  webSearch: new WebSearchScraper(),
  stealthBrowser: new StealthBrowserScraper(),
  mastodon: new MastodonScraper(),
  twitter: new TwitterScraper(),
};

/**
 * Get all available scrapers with their configuration.
 * Scrapers requiring API keys are disabled if keys are not configured.
 */
export function getAllScrapers() {
  return [
    // RSS and feed-based scrapers (no API key required)
    { scraper: scraperInstances.rss, enabled: true, config: {} },
    { scraper: scraperInstances.filing, enabled: true, config: {} },
    { scraper: scraperInstances.blog, enabled: true, config: {} },
    { scraper: scraperInstances.social, enabled: true, config: {} },
    { scraper: scraperInstances.jobPosting, enabled: true, config: {} },
    { scraper: scraperInstances.transcript, enabled: true, config: {} },
    { scraper: scraperInstances.news, enabled: true, config: {} },

    // GitHub scraper (optional token for higher rate limits)
    { scraper: scraperInstances.github, enabled: true, config: { githubToken: process.env.GITHUB_TOKEN } },

    // Certificate transparency (no API key required)
    { scraper: scraperInstances.certTransparency, enabled: true, config: {} },

    // Reddit financial scraper (no API key required)
    { scraper: scraperInstances.redditFinancial, enabled: true, config: {} },

    // Press release wires (no API key required)
    { scraper: scraperInstances.pressRelease, enabled: true, config: {} },

    // USPTO patent scraper (requires API key)
    { scraper: scraperInstances.uspto, enabled: !!process.env.USPTO_API_KEY, config: { apiKey: process.env.USPTO_API_KEY } },

    // CourtListener litigation scraper (requires API key)
    { scraper: scraperInstances.courtListener, enabled: !!process.env.COURT_LISTENER_API_KEY, config: { apiKey: process.env.COURT_LISTENER_API_KEY } },

    // FDA scraper (no API key required)
    { scraper: scraperInstances.fda, enabled: true, config: {} },

    // SAM.gov contract scraper (requires API key)
    { scraper: scraperInstances.sam, enabled: !!process.env.SAM_API_KEY, config: { apiKey: process.env.SAM_API_KEY } },

    // Wayback Machine scraper (no API key required)
    { scraper: scraperInstances.wayback, enabled: true, config: {} },

    // Congress.gov scraper (requires API key)
    { scraper: scraperInstances.congress, enabled: !!process.env.CONGRESS_API_KEY, config: { apiKey: process.env.CONGRESS_API_KEY } },

    // Academic paper scraper (no API key required)
    { scraper: scraperInstances.academic, enabled: true, config: {} },

    // Lobbying disclosure scraper (no API key required)
    { scraper: scraperInstances.lobbying, enabled: true, config: {} },

    // Supplier earnings scraper (no API key required)
    { scraper: scraperInstances.supplierEarning, enabled: true, config: {} },

    // Executive appearance scraper (no API key required)
    { scraper: scraperInstances.execAppearance, enabled: true, config: {} },

    // App Store tracker (no API key required)
    { scraper: scraperInstances.appStoreTracker, enabled: true, config: {} },

    // Domain registration tracker (no API key required)
    { scraper: scraperInstances.domainTracker, enabled: true, config: {} },

    // Conference agenda scraper (no API key required)
    { scraper: scraperInstances.conferenceAgenda, enabled: true, config: {} },

    // App Store RSS scraper (no API key required)
    { scraper: scraperInstances.appStore, enabled: true, config: {} },

    // Conference scraper (no API key required)
    { scraper: scraperInstances.conference, enabled: true, config: {} },

    // Web search scraper (Brave Search API primary, DuckDuckGo fallback)
    // Always enabled: uses DuckDuckGo if Brave key not configured
    { scraper: scraperInstances.webSearch, enabled: true, config: { braveApiKey: process.env.BRAVE_API_KEY } },

    // Stealth browser scraper (CloakBrowser for bypassing bot protection)
    // Enabled by default, can be disabled via STEALTH_SCRAPER_ENABLED env var
    { scraper: scraperInstances.stealthBrowser, enabled: process.env.STEALTH_SCRAPER_ENABLED !== "false", config: {} },

    // Mastodon social signals (no API key required, public endpoints only)
    { scraper: scraperInstances.mastodon, enabled: true, config: {} },
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
