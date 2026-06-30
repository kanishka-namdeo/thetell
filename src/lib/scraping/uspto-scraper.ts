/**
 * USPTO Patent scraper for tracking company patent applications and grants.
 *
 * Queries the USPTO Patent Application Information Retrieval (PAIR) API
 * and bulk data search to discover patent filings by assignee name.
 *
 * Signal value: R&D direction, technology pivots, defensive patenting.
 *
 * API key: Set USPTO_API_KEY env var (free registration at api.uspto.gov).
 * If no key is configured, the scraper gracefully returns empty results.
 *
 * Note: Starting June 18, 2026, sign-in is required for ODP (Online Data Platform).
 * The bulk data search endpoint remains available without sign-in for basic queries.
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const USPTO_API_BASE = "https://api.uspto.gov/api/v1";
const USPTO_BULK_BASE = "https://api.uspto.gov/api/v1/bulk-data";

export interface PatentRecord {
  applicationNumber: string;
  filingDate: string;
  publicationNumber: string;
  publicationDate: string | null;
  title: string;
  assignee: string;
  inventors: string[];
  ipcCodes: string[];
  uspcCodes: string[];
  abstract: string;
  status: string;
  url: string;
}

export interface PatentSearchResult {
  assignee: string;
  totalResults: number;
  patents: PatentRecord[];
}

export interface UsptoSignal {
  sourceUrl: string;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
  metadata: Record<string, string>;
}

export class UspScraper extends BaseScraper {
  private apiKey: string | null;

  constructor() {
    // USPTO API: moderate rate limit (10 req/s), 30s timeout, 3 retries, 6h cache
    super(5.0, 30000, 3, 21600);
    this.apiKey = process.env.USPTO_API_KEY ?? null;
  }

  override get scraperName(): string {
    return "uspto-scraper";
  }

  /**
   * Whether the scraper is configured with an API key.
   * Without a key, only bulk data search (limited) is available.
   */
  get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Search for patent applications by assignee (company) name.
   * Returns patent records or null if the API is unreachable.
   */
  async scrapeByAssignee(
    assigneeName: string,
    limit: number = 50,
  ): Promise<UsptoSignal[]> {
    if (!this.isConfigured) {
      logger.warn("uspto.scraper.skipped", {
        reason: "USPTO_API_KEY not configured",
      });
      return [];
    }

    logger.info("uspto.scrape.start", { assignee: assigneeName, limit });

    const patents = await this.searchPatents(assigneeName, limit);
    if (!patents) {
      logger.error("uspto.scrape.failed", { assignee: assigneeName });
      return [];
    }

    const signals = patents.map((patent) => this.toSignal(patent));

    logger.info("uspto.scrape.complete", {
      assignee: assigneeName,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Fetch details for a specific patent by application number.
   */
  async scrapePatentByNumber(
    applicationNumber: string,
  ): Promise<UsptoSignal | null> {
    if (!this.isConfigured) {
      logger.warn("uspto.scrape.skipped", {
        reason: "USPTO_API_KEY not configured",
      });
      return null;
    }

    const url = `${USPTO_API_BASE}/patent/applications/${encodeURIComponent(applicationNumber)}`;
    const json = await this.fetchWithApiKey(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      const patent = this.parsePatentRecord(data);
      return patent ? this.toSignal(patent) : null;
    } catch (error) {
      logger.error("uspto.parse.failed", {
        applicationNumber,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Search the USPTO bulk data index for patents by assignee.
   */
  private async searchPatents(
    assigneeName: string,
    limit: number,
  ): Promise<PatentRecord[] | null> {
    const params = new URLSearchParams({
      search: `an/${assigneeName}`,
      rows: String(limit),
      start: "0",
      fl: "applId,filingDate,pubNumber,pubDate,title,assignee,inventor,ipc,uspc,abstract,status",
    });

    const url = `${USPTO_BULK_BASE}/search?${params.toString()}`;
    const json = await this.fetchWithApiKey(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseSearchResponse(data);
    } catch (error) {
      logger.error("uspto.search.parse.failed", {
        assignee: assigneeName,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Fetch a URL with the USPTO API key in the Authorization header.
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
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(this.timeout),
          redirect: "follow",
        });

        if (response.ok) {
          const text = await this.readBodyWithLimit(response);
          await this.cache.set(url, text);
          return text;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(2 ** attempt * 1000, 60000);

          logger.warn("uspto.rate.limited", {
            url,
            status: response.status,
            waitTime: waitTime / 1000,
            attempt,
          });

          await response.body?.cancel();
          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        const waitTime = Math.min(2 ** attempt * 1000, 60000);

        logger.warn("uspto.request.error", {
          url,
          error: String(error),
          attempt,
        });

        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    logger.error("uspto.fetch.failed", {
      url,
      error: lastError?.message ?? "Unknown error",
    });
    return null;
  }

  /**
   * Parse the bulk search API response into PatentRecord array.
   */
  private parseSearchResponse(data: Record<string, unknown>): PatentRecord[] {
    const response = data.response as Record<string, unknown> | undefined;
    if (!response) return [];

    const docs = response.docs as Array<Record<string, unknown>> | undefined;
    if (!docs || !Array.isArray(docs)) return [];

    return docs
      .map((doc) => this.parsePatentRecord(doc))
      .filter((p): p is PatentRecord => p !== null);
  }

  /**
   * Parse a single patent document from the API response.
   */
  private parsePatentRecord(
    doc: Record<string, unknown>,
  ): PatentRecord | null {
    const applicationNumber = this.str(doc.applId ?? doc.applicationNumber);
    const title = this.str(doc.title ?? doc.inventionTitle);

    if (!applicationNumber && !title) return null;

    const assignee = this.str(doc.assignee ?? doc.assigneeName);
    const filingDate = this.str(doc.filingDate ?? doc.filedDate);
    const publicationNumber = this.str(
      doc.pubNumber ?? doc.publicationNumber,
    );
    const publicationDate = this.str(doc.pubDate ?? doc.publicationDate);
    const abstract = this.str(doc.abstract ?? doc.abstractText);
    const status = this.str(doc.status ?? doc.applicationStatus);

    const inventors = this.strArray(doc.inventor ?? doc.inventors);
    const ipcCodes = this.strArray(doc.ipc ?? doc.ipcCodes);
    const uspcCodes = this.strArray(doc.uspc ?? doc.uspcCodes);

    const url = applicationNumber
      ? `https://patentcenter.uspto.gov/applications/${applicationNumber}`
      : "";

    return {
      applicationNumber,
      filingDate,
      publicationNumber,
      publicationDate: publicationDate || null,
      title,
      assignee,
      inventors,
      ipcCodes,
      uspcCodes,
      abstract,
      status,
      url,
    };
  }

  /**
   * Convert a PatentRecord into a UsptoSignal for downstream processing.
   */
  private toSignal(patent: PatentRecord): UsptoSignal {
    const contentParts = [
      `Patent: ${patent.title}`,
      `Assignee: ${patent.assignee}`,
      `Filed: ${patent.filingDate}`,
    ];

    if (patent.abstract) contentParts.push(`Abstract: ${patent.abstract}`);
    if (patent.status) contentParts.push(`Status: ${patent.status}`);
    if (patent.inventors.length > 0) {
      contentParts.push(`Inventors: ${patent.inventors.join(", ")}`);
    }
    if (patent.ipcCodes.length > 0) {
      contentParts.push(`IPC: ${patent.ipcCodes.join(", ")}`);
    }

    return {
      sourceUrl: patent.url,
      title: `${patent.title} — ${patent.assignee}`,
      rawContent: contentParts.join("\n"),
      publishedAt: patent.filingDate ? new Date(patent.filingDate) : null,
      metadata: {
        source: "uspto",
        applicationNumber: patent.applicationNumber,
        publicationNumber: patent.publicationNumber,
        assignee: patent.assignee,
        status: patent.status,
        ipcCodes: patent.ipcCodes.join(";"),
      },
    };
  }

  private str(val: unknown): string {
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return String(val);
    return "";
  }

  private strArray(val: unknown): string[] {
    if (Array.isArray(val)) {
      return val
        .map((v) => (typeof v === "string" ? v.trim() : String(v)))
        .filter((s) => s.length > 0);
    }
    if (typeof val === "string" && val.length > 0) {
      return val.split(/[;,]/).map((s) => s.trim()).filter((s) => s.length > 0);
    }
    return [];
  }
}
