/**
 * CourtListener litigation scraper for tracking federal court cases.
 *
 * Queries the CourtListener REST API to discover lawsuits, bankruptcy cases,
 * patent disputes, and antitrust litigation involving a company.
 *
 * Signal value: legal exposure, financial distress, competitive disputes.
 *
 * API key: Set COURT_LISTENER_API_KEY env var (free registration at courtlistener.com).
 * If no key is configured, the scraper gracefully returns empty results.
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const COURT_LISTENER_API_BASE = "https://www.courtlistener.com/api/rest/v3";

export interface CourtCase {
  id: string;
  caseName: string;
  docketNumber: string;
  courtName: string;
  dateFiled: string;
  dateTerminated: string | null;
  partyNames: string[];
  causeOfAction: string;
  natureOfSuit: string;
  jurisdiction: string;
  status: string;
  absoluteUrl: string;
}

export interface DocketEntry {
  id: string;
  docketId: string;
  entryNumber: number;
  dateFiled: string;
  description: string;
  url: string;
}

export interface LitigationSearchResult {
  partyName: string;
  totalResults: number;
  cases: CourtCase[];
}

export interface CourtListenerSignal {
  sourceUrl: string;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
  metadata: Record<string, string>;
}

export class CourtListenerScraper extends BaseScraper {
  private apiKey: string | null;

  constructor() {
    // CourtListener API: moderate rate limit, 30s timeout, 3 retries, 6h cache
    super(5.0, 30000, 3, 21600);
    this.apiKey = process.env.COURT_LISTENER_API_KEY ?? null;
  }

  override get scraperName(): string {
    return "courtlistener-scraper";
  }

  /**
   * Whether the scraper is configured with an API key.
   */
  get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Search for cases by party name (company name).
   * Returns litigation signals or empty array if not configured.
   */
  async scrapeByPartyName(
    partyName: string,
    limit: number = 20,
  ): Promise<CourtListenerSignal[]> {
    if (!this.isConfigured) {
      logger.warn("courtlistener.scraper.skipped", {
        reason: "COURT_LISTENER_API_KEY not configured",
      });
      return [];
    }

    logger.info("courtlistener.scrape.start", { partyName, limit });

    const cases = await this.searchCases(partyName, limit);
    if (!cases) {
      logger.error("courtlistener.scrape.failed", { partyName });
      return [];
    }

    const signals = cases.map((courtCase) => this.toSignal(courtCase));

    logger.info("courtlistener.scrape.complete", {
      partyName,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Fetch docket entries for a specific case by docket ID.
   */
  async scrapeDocketEntries(
    docketId: string,
    limit: number = 50,
  ): Promise<DocketEntry[]> {
    if (!this.isConfigured) {
      logger.warn("courtlistener.docket.skipped", {
        reason: "COURT_LISTENER_API_KEY not configured",
      });
      return [];
    }

    const url = `${COURT_LISTENER_API_BASE}/recap-documents/?docket_entry__docket__id=${docketId}&page_size=${limit}`;
    const json = await this.fetchWithApiKey(url);
    if (!json) return [];

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseDocketEntries(data);
    } catch (error) {
      logger.error("courtlistener.docket.parse.failed", {
        docketId,
        error: String(error),
      });
      return [];
    }
  }

  /**
   * Search CourtListener for cases involving a party.
   */
  private async searchCases(
    partyName: string,
    limit: number,
  ): Promise<CourtCase[] | null> {
    const params = new URLSearchParams({
      q: `party:"${partyName}"`,
      page_size: String(limit),
      order_by: "-date_filed",
    });

    const url = `${COURT_LISTENER_API_BASE}/search/?${params.toString()}`;
    const json = await this.fetchWithApiKey(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseSearchResponse(data);
    } catch (error) {
      logger.error("courtlistener.search.parse.failed", {
        partyName,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Fetch a URL with the CourtListener API key in the Authorization header.
   */
  private async fetchWithApiKey(url: string): Promise<string | null> {
    if (!this.apiKey) return null;

    const cached = await this.cache.get(url);
    if (cached !== null) {
      return cached;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      await this.rateLimiter.wait();

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": BaseScraper.USER_AGENT,
            Authorization: `Token ${this.apiKey}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(this.timeout),
          redirect: "follow",
        });

        if (response.ok) {
          const text = await response.text();
          await this.cache.set(url, text);
          return text;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(2 ** attempt * 1000, 60000);

          logger.warn("courtlistener.rate.limited", {
            url,
            status: response.status,
            waitTime: waitTime / 1000,
            attempt,
          });

          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        const waitTime = Math.min(2 ** attempt * 1000, 60000);

        logger.warn("courtlistener.request.error", {
          url,
          error: String(error),
          attempt,
        });

        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    logger.error("courtlistener.fetch.failed", {
      url,
      error: lastError?.message ?? "Unknown error",
    });
    return null;
  }

  /**
   * Parse the search API response into CourtCase array.
   */
  private parseSearchResponse(data: Record<string, unknown>): CourtCase[] {
    const results = data.results as Array<Record<string, unknown>> | undefined;
    if (!results || !Array.isArray(results)) return [];

    return results
      .map((doc) => this.parseCourtCase(doc))
      .filter((c): c is CourtCase => c !== null);
  }

  /**
   * Parse a single case document from the API response.
   */
  private parseCourtCase(doc: Record<string, unknown>): CourtCase | null {
    const id = this.str(doc.id);
    const caseName = this.str(doc.caseName);

    if (!id && !caseName) return null;

    const docketNumber = this.str(doc.docketNumber);
    const court = doc.court as Record<string, unknown> | undefined;
    const courtName = this.str(court?.name ?? doc.courtName);
    const dateFiled = this.str(doc.dateFiled);
    const dateTerminated = this.str(doc.dateTerminated);
    const causeOfAction = this.str(doc.causeOfAction);
    const natureOfSuit = this.str(doc.natureOfSuit);
    const jurisdiction = this.str(doc.jurisdiction);
    const docket = doc.docket as Record<string, unknown> | undefined;
    const status = this.str(docket?.status ?? doc.status);
    const absoluteUrl = this.str(doc.absolute_url);

    const parties = doc.party as Array<Record<string, unknown>> | undefined;
    const partyNames = parties
      ? parties
          .map((p) => this.str(p.name))
          .filter((n) => n.length > 0)
      : [];

    return {
      id,
      caseName,
      docketNumber,
      courtName,
      dateFiled,
      dateTerminated: dateTerminated || null,
      partyNames,
      causeOfAction,
      natureOfSuit,
      jurisdiction,
      status,
      absoluteUrl,
    };
  }

  /**
   * Parse docket entries from the RECAP documents response.
   */
  private parseDocketEntries(data: Record<string, unknown>): DocketEntry[] {
    const results = data.results as Array<Record<string, unknown>> | undefined;
    if (!results || !Array.isArray(results)) return [];

    return results
      .map((doc) => {
        const docketEntry = doc.docket_entry as Record<string, unknown> | undefined;
        const innerDocket = docketEntry?.docket as Record<string, unknown> | undefined;
        const id = this.str(doc.id);
        const docketId = this.str(innerDocket?.id ?? doc.docket_id);
        const entryNumber = Number(doc.entry_number ?? 0);
        const dateFiled = this.str(doc.date_filed ?? doc.dateFiled);
        const description = this.str(doc.description);
        const url = this.str(doc.absolute_url ?? doc.filepath_local);

        return { id, docketId, entryNumber, dateFiled, description, url };
      })
      .filter((e) => e.id && e.docketId);
  }

  /**
   * Convert a CourtCase into a CourtListenerSignal for downstream processing.
   */
  private toSignal(courtCase: CourtCase): CourtListenerSignal {
    const contentParts = [
      `Case: ${courtCase.caseName}`,
      `Docket: ${courtCase.docketNumber}`,
      `Court: ${courtCase.courtName}`,
      `Filed: ${courtCase.dateFiled}`,
    ];

    if (courtCase.partyNames.length > 0) {
      contentParts.push(`Parties: ${courtCase.partyNames.join(", ")}`);
    }
    if (courtCase.causeOfAction) {
      contentParts.push(`Cause: ${courtCase.causeOfAction}`);
    }
    if (courtCase.natureOfSuit) {
      contentParts.push(`Nature: ${courtCase.natureOfSuit}`);
    }
    if (courtCase.status) {
      contentParts.push(`Status: ${courtCase.status}`);
    }

    return {
      sourceUrl: courtCase.absoluteUrl,
      title: `${courtCase.caseName} — ${courtCase.docketNumber}`,
      rawContent: contentParts.join("\n"),
      publishedAt: courtCase.dateFiled ? new Date(courtCase.dateFiled) : null,
      metadata: {
        source: "courtlistener",
        caseId: courtCase.id,
        docketNumber: courtCase.docketNumber,
        court: courtCase.courtName,
        status: courtCase.status,
        parties: courtCase.partyNames.join(";"),
      },
    };
  }

  private str(val: unknown): string {
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return String(val);
    return "";
  }
}
