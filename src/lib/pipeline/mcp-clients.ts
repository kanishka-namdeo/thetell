/**
 * MCP server wrapper functions for pipeline discovery.
 *
 * These functions call real HTTP APIs to discover company information,
 * filings, patents, job postings, and other signals.
 */

import { logger } from "@/lib/logger";

export interface McpSource {
  url: string;
  sourceType: string;
  label?: string;
  priority?: number;
}

export interface McpResult {
  server: string;
  sources: McpSource[];
  duration: number;
  error?: string;
}

/**
 * Timeout wrapper for promises
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Fetch with timeout and error handling
 */
async function safeFetch(
  url: string,
  options: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  return withTimeout(fetch(url, options), timeoutMs);
}

/**
 * Call the free-search MCP server to find company information.
 */
export async function callFreeSearch(query: string): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({ tool: "free-search", query });

  try {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return {
        server: "free-search",
        sources: [],
        duration: Date.now() - start,
        error: "BRAVE_API_KEY not configured",
      };
    }

    log.info("Calling Brave Search API");

    const response = await safeFetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Brave API returned ${response.status}`);
    }

    const data = await response.json();
    const sources: McpSource[] = [];

    // Extract domain from first result
    if (data.web?.results?.[0]?.url) {
      const url = data.web.results[0].url;
      const domain = new URL(url).hostname;
      sources.push({
        url: `https://${domain}`,
        sourceType: "NEWS",
        label: data.web.results[0].title || "Company Website",
        priority: 1,
      });
    }

    return {
      server: "free-search",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("free-search failed", { error: String(error) });
    return {
      server: "free-search",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call the SEC EDGAR MCP server to find filings for a company.
 */
export async function callSecEdgar(companyName: string): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({ tool: "sec-edgar", company: companyName });

  try {
    log.info("Calling SEC EDGAR API");

    // Step 1: Look up company CIK from EDGAR company tickers
    const tickersUrl =
      "https://www.sec.gov/files/company_tickers.json";
    const tickersResponse = await safeFetch(tickersUrl, {
      headers: {
        "User-Agent": "TheTell-Bot/1.0 (contact@example.com)",
        Accept: "application/json",
      },
    });

    if (!tickersResponse.ok) {
      throw new Error(`SEC EDGAR tickers returned ${tickersResponse.status}`);
    }

    const tickersData = await tickersResponse.json();
    const sources: McpSource[] = [];

    // Search for matching company by name
    const entries = Object.values(tickersData) as Array<{
      cik_str: number;
      ticker: string;
      title: string;
    }>;
    const match = entries.find((e) =>
      e.title.toLowerCase().includes(companyName.toLowerCase())
    );

    if (match) {
      const cik = String(match.cik_str).padStart(10, "0");
      sources.push({
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
        sourceType: "FILING",
        label: `${match.title} (CIK: ${cik}, Ticker: ${match.ticker})`,
        priority: 2,
      });
    }

    // Step 2: Also add the EDGAR full-text search URL as a fallback
    sources.push({
      url: `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&dateRange=custom&startdt=2020-01-01&enddt=2026-12-31`,
      sourceType: "FILING",
      label: `${companyName} SEC EDGAR Full-Text Search`,
      priority: 3,
    });

    return {
      server: "sec-edgar",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("sec-edgar failed", { error: String(error) });
    return {
      server: "sec-edgar",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call the GitHub MCP server to find company repositories.
 */
export async function callGitHub(companyName: string): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({ tool: "github", company: companyName });

  try {
    log.info("Calling GitHub Search API");

    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
      companyName
    )}&sort=stars&order=desc`;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "TheTell-Bot/1.0 (contact@example.com)",
    };

    // Optional token for higher rate limit
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    const response = await safeFetch(url, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const data = await response.json();
    const sources: McpSource[] = [];

    // Add top repositories
    if (data.items && Array.isArray(data.items)) {
      for (const repo of data.items.slice(0, 5)) {
        sources.push({
          url: repo.html_url,
          sourceType: "TECH_SIGNAL",
          label: `${repo.full_name} (${repo.stargazers_count} stars)`,
          priority: 4,
        });
      }
    }

    return {
      server: "github",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("github failed", { error: String(error) });
    return {
      server: "github",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call the USPTO MCP server to find patent filings.
 */
export async function callUspto(companyName: string): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({ tool: "uspto", company: companyName });

  try {
    const apiKey = process.env.USPTO_API_KEY;
    if (!apiKey) {
      return {
        server: "uspto",
        sources: [],
        duration: Date.now() - start,
        error: "USPTO_API_KEY not configured",
      };
    }

    log.info("Calling USPTO PatentsView API");

    const query = JSON.stringify({
      _text_any: { patent_assignee_organization: companyName },
    });

    const fields = JSON.stringify([
      "patent_number",
      "patent_title",
      "patent_date",
    ]);

    const options = JSON.stringify({ page: 1, per_page: 10 });

    const url = `https://api.patentsview.org/patents/query?q=${encodeURIComponent(
      query
    )}&f=${encodeURIComponent(fields)}&o=${encodeURIComponent(options)}`;

    const response = await safeFetch(url, {
      headers: {
        "api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`USPTO API returned ${response.status}`);
    }

    const data = await response.json();
    const sources: McpSource[] = [];

    // Add patent results
    if (data.patents && Array.isArray(data.patents)) {
      for (const patent of data.patents.slice(0, 5)) {
        sources.push({
          url: `https://patft.uspto.gov/netahtml?patent=${patent.patent_number}`,
          sourceType: "PATENT",
          label: `${patent.patent_title} (${patent.patent_date})`,
          priority: 6,
        });
      }
    }

    return {
      server: "uspto",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("uspto failed", { error: String(error) });
    return {
      server: "uspto",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call the CourtListener MCP server to find litigation records.
 */
export async function callCourtListener(companyName: string): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({ tool: "courtlistener", company: companyName });

  try {
    const apiKey = process.env.COURT_LISTENER_API_KEY;
    if (!apiKey) {
      return {
        server: "courtlistener",
        sources: [],
        duration: Date.now() - start,
        error: "COURT_LISTENER_API_KEY not configured",
      };
    }

    log.info("Calling CourtListener API");

    const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(
      companyName
    )}&type=d&type=o&page_size=10`;

    const response = await safeFetch(url, {
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `CourtListener API returned ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const data = await response.json();
    const sources: McpSource[] = [];

    // Add results from search
    if (data.results && Array.isArray(data.results)) {
      for (const result of data.results.slice(0, 5)) {
        const docketId = result.docket_id || result.id;
        const caseName = result.caseName || result.case_name || `${companyName} Court Record`;
        sources.push({
          url: `https://www.courtlistener.com/docket/${docketId}/`,
          sourceType: "LITIGATION",
          label: caseName,
          priority: 7,
        });
      }
    }

    // Always include a direct search URL as fallback
    if (sources.length === 0) {
      sources.push({
        url: `https://www.courtlistener.com/?q=${encodeURIComponent(companyName)}&type=d`,
        sourceType: "LITIGATION",
        label: `${companyName} CourtListener Search`,
        priority: 7,
      });
    }

    return {
      server: "courtlistener",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("courtlistener failed", { error: String(error) });
    return {
      server: "courtlistener",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call the JobDataLake MCP server to find job postings.
 */
export async function callJobData(companyName: string): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({ tool: "jobdata", company: companyName });

  try {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return {
        server: "jobdata",
        sources: [],
        duration: Date.now() - start,
        error: "BRAVE_API_KEY not configured",
      };
    }

    log.info("Calling Brave Search for job postings");

    const query = `"${companyName}" jobs OR careers OR hiring site:linkedin.com OR site:indeed.com`;

    const response = await safeFetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Brave API returned ${response.status}`);
    }

    const data = await response.json();
    const sources: McpSource[] = [];

    // Extract job board URLs
    if (data.web?.results && Array.isArray(data.web.results)) {
      for (const result of data.web.results.slice(0, 5)) {
        sources.push({
          url: result.url,
          sourceType: "JOB_POSTING",
          label: result.title || "Job Posting",
          priority: 5,
        });
      }
    }

    return {
      server: "jobdata",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("jobdata failed", { error: String(error) });
    return {
      server: "jobdata",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call free-search specifically for discovering additional sources.
 */
export async function callFreeSearchForSources(
  companyName: string
): Promise<McpResult> {
  const start = Date.now();
  const log = logger.child({
    tool: "free-search-sources",
    company: companyName,
  });

  try {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return {
        server: "free-search",
        sources: [],
        duration: Date.now() - start,
        error: "BRAVE_API_KEY not configured",
      };
    }

    log.info("Calling Brave Search for multiple source types");

    // Run 3 searches in parallel
    const [rssSearch, socialSearch, newsSearch] = await Promise.all([
      safeFetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          `"${companyName}" RSS feed`
        )}`,
        {
          headers: {
            "X-Subscription-Token": apiKey,
            Accept: "application/json",
          },
        }
      ),
      safeFetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          `"${companyName}" site:twitter.com OR site:linkedin.com`
        )}`,
        {
          headers: {
            "X-Subscription-Token": apiKey,
            Accept: "application/json",
          },
        }
      ),
      safeFetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          `"${companyName}" news`
        )}`,
        {
          headers: {
            "X-Subscription-Token": apiKey,
            Accept: "application/json",
          },
        }
      ),
    ]);

    const sources: McpSource[] = [];

    // Extract RSS/Atom feed URLs
    if (rssSearch.ok) {
      const rssData = await rssSearch.json();
      if (rssData.web?.results && Array.isArray(rssData.web.results)) {
        for (const result of rssData.web.results.slice(0, 3)) {
          if (
            result.url.includes("rss") ||
            result.url.includes("feed") ||
            result.url.includes("atom")
          ) {
            sources.push({
              url: result.url,
              sourceType: "RSS",
              label: result.title || "RSS Feed",
              priority: 3,
            });
          }
        }
      }
    }

    // Extract social URLs
    if (socialSearch.ok) {
      const socialData = await socialSearch.json();
      if (
        socialData.web?.results &&
        Array.isArray(socialData.web.results)
      ) {
        for (const result of socialData.web.results.slice(0, 3)) {
          sources.push({
            url: result.url,
            sourceType: "SOCIAL",
            label: result.title || "Social Media",
            priority: 6,
          });
        }
      }
    }

    // Extract news URLs
    if (newsSearch.ok) {
      const newsData = await newsSearch.json();
      if (newsData.web?.results && Array.isArray(newsData.web.results)) {
        for (const result of newsData.web.results.slice(0, 3)) {
          sources.push({
            url: result.url,
            sourceType: "NEWS",
            label: result.title || "News Article",
            priority: 3,
          });
        }
      }
    }

    return {
      server: "free-search",
      sources,
      duration: Date.now() - start,
    };
  } catch (error) {
    log.error("free-search-sources failed", { error: String(error) });
    return {
      server: "free-search",
      sources: [],
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
