/**
 * Wayback Machine scraper for tracking website changes over time.
 *
 * Queries the Internet Archive CDX API to discover historical snapshots
 * of a company's website, then compares snapshots to detect significant
 * changes in pricing, features, rebranding, or removed content.
 *
 * Signal value: strategic pivots, removed content, pricing changes,
 * feature launches, rebranding, evolution tracking.
 *
 * No API key required. Rate limit: be respectful, ~1 request/second.
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const CDX_API_BASE = "https://web.archive.org/cdx/search/cdx";

export interface WaybackSnapshot {
  url: string;
  timestamp: string;
  original: string;
  mimeType: string;
  statusCode: string;
  digest: string;
  length: number;
  archiveUrl: string;
}

export interface SnapshotComparison {
  earlierUrl: string;
  earlierDate: Date;
  laterUrl: string;
  laterDate: Date;
  digestChanged: boolean;
  significantChange: boolean;
  changeDescription: string;
}

export interface WaybackSignal {
  sourceUrl: string;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
  metadata: Record<string, string>;
}

export class WaybackScraper extends BaseScraper {
  constructor() {
    // Wayback Machine CDX: conservative rate, 30s timeout, 3 retries, 12h cache
    super(1.0, 30000, 3, 43200);
  }

  /**
   * Fetch CDX index of snapshots for a domain.
   * Returns signals representing notable snapshots and changes.
   */
  async scrapeDomainChanges(
    domain: string,
    limit: number = 50,
  ): Promise<WaybackSignal[]> {
    logger.info("wayback.scrape.start", { domain, limit });

    const snapshots = await this.fetchSnapshots(domain, limit);
    if (!snapshots || snapshots.length === 0) {
      logger.warn("wayback.scrape.noSnapshots", { domain });
      return [];
    }

    const comparisons = this.compareSnapshots(snapshots);
    const signals = comparisons.map((comp) => this.comparisonToSignal(comp, domain));

    logger.info("wayback.scrape.complete", {
      domain,
      snapshotCount: snapshots.length,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Fetch snapshots for specific URL patterns (e.g., pricing page).
   * Useful for tracking changes to a particular page type.
   */
  async scrapeUrlChanges(
    urlPattern: string,
    limit: number = 50,
  ): Promise<WaybackSignal[]> {
    logger.info("wayback.url.start", { urlPattern, limit });

    const snapshots = await this.fetchSnapshots(urlPattern, limit);
    if (!snapshots || snapshots.length === 0) {
      logger.warn("wayback.url.noSnapshots", { urlPattern });
      return [];
    }

    const comparisons = this.compareSnapshots(snapshots);
    const signals = comparisons.map((comp) => this.comparisonToSignal(comp, urlPattern));

    logger.info("wayback.url.complete", {
      urlPattern,
      snapshotCount: snapshots.length,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Get the most recent snapshot URL for a domain.
   */
  async getLatestSnapshot(domain: string): Promise<string | null> {
    const snapshots = await this.fetchSnapshots(domain, 1);
    if (!snapshots || snapshots.length === 0) return null;
    return snapshots[0].archiveUrl;
  }

  /**
   * Fetch snapshots from the CDX API for a given URL pattern.
   */
  private async fetchSnapshots(
    urlPattern: string,
    limit: number,
  ): Promise<WaybackSnapshot[] | null> {
    const params = new URLSearchParams({
      url: `${urlPattern}/*`,
      output: "json",
      limit: String(limit),
      sort: "closest",
      matchType: "prefix",
      collapse: "digest",
      filter: "statuscode:200",
      fl: "original,timestamp,mimetype,statuscode,digest,length",
    });

    const url = `${CDX_API_BASE}?${params.toString()}`;
    const json = await this.fetch(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json);
      return this.parseCdxResponse(data);
    } catch (error) {
      logger.error("wayback.parse.failed", {
        urlPattern,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Parse the CDX JSON response into WaybackSnapshot array.
   * The CDX API returns the first row as column headers when output=json.
   */
  private parseCdxResponse(data: unknown): WaybackSnapshot[] {
    if (!Array.isArray(data) || data.length < 2) return [];

    const headers = data[0] as string[];
    const rows = data.slice(1) as string[][];

    return rows
      .map((row) => this.parseRow(headers, row))
      .filter((s): s is WaybackSnapshot => s !== null);
  }

  /**
   * Parse a single CDX row into a WaybackSnapshot.
   */
  private parseRow(
    headers: string[],
    row: string[],
  ): WaybackSnapshot | null {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] ?? "";
    });

    const original = record.original ?? "";
    const timestamp = record.timestamp ?? "";

    if (!original || !timestamp) return null;

    const archiveUrl = `https://web.archive.org/web/${timestamp}/${original}`;

    return {
      url: original,
      timestamp,
      original,
      mimeType: record.mimetype ?? "",
      statusCode: record.statuscode ?? "",
      digest: record.digest ?? "",
      length: parseInt(record.length ?? "0", 10),
      archiveUrl,
    };
  }

  /**
   * Compare consecutive snapshots to detect significant changes.
   * A change is considered significant when the content digest differs,
   * indicating the page content was modified between captures.
   */
  private compareSnapshots(snapshots: WaybackSnapshot[]): SnapshotComparison[] {
    if (snapshots.length < 2) return [];

    const comparisons: SnapshotComparison[] = [];

    for (let i = 1; i < snapshots.length; i++) {
      const earlier = snapshots[i - 1];
      const later = snapshots[i];

      const digestChanged = earlier.digest !== later.digest;
      const earlierDate = this.parseWaybackTimestamp(earlier.timestamp);
      const laterDate = this.parseWaybackTimestamp(later.timestamp);

      if (!earlierDate || !laterDate) continue;

      const daysApart = Math.abs(
        (laterDate.getTime() - earlierDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const significantChange = digestChanged && daysApart > 1;

      const changeDescription = this.describeChange(
        earlier,
        later,
        daysApart,
        digestChanged,
      );

      comparisons.push({
        earlierUrl: earlier.archiveUrl,
        earlierDate,
        laterUrl: later.archiveUrl,
        laterDate,
        digestChanged,
        significantChange,
        changeDescription,
      });
    }

    return comparisons;
  }

  /**
   * Describe the nature of change between two snapshots.
   */
  private describeChange(
    earlier: WaybackSnapshot,
    later: WaybackSnapshot,
    daysApart: number,
    digestChanged: boolean,
  ): string {
    if (!digestChanged) {
      return `No content change between ${earlier.timestamp} and ${later.timestamp} (${Math.round(daysApart)} days apart)`;
    }

    const sizeDelta = later.length - earlier.length;
    const sizeDirection =
      sizeDelta > 0
        ? `grew by ${sizeDelta} bytes`
        : sizeDelta < 0
          ? `shrank by ${Math.abs(sizeDelta)} bytes`
          : "same size";

    return `Content changed between ${earlier.timestamp} and ${later.timestamp} (${Math.round(daysApart)} days apart, ${sizeDirection})`;
  }

  /**
   * Parse a Wayback Machine timestamp (YYYYMMDDHHmmss format) into a Date.
   */
  private parseWaybackTimestamp(timestamp: string): Date | null {
    if (!timestamp || timestamp.length < 14) return null;

    const year = timestamp.substring(0, 4);
    const month = timestamp.substring(4, 6);
    const day = timestamp.substring(6, 8);
    const hour = timestamp.substring(8, 10);
    const minute = timestamp.substring(10, 12);
    const second = timestamp.substring(12, 14);

    const date = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
    );

    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Convert a SnapshotComparison into a WaybackSignal for downstream processing.
   */
  private comparisonToSignal(
    comparison: SnapshotComparison,
    domain: string,
  ): WaybackSignal {
    const contentParts = [
      `Domain: ${domain}`,
      `Change: ${comparison.changeDescription}`,
      `Earlier Snapshot: ${comparison.earlierUrl}`,
      `Later Snapshot: ${comparison.laterUrl}`,
      `Content Modified: ${comparison.digestChanged ? "Yes" : "No"}`,
      `Significant: ${comparison.significantChange ? "Yes" : "No"}`,
    ];

    return {
      sourceUrl: comparison.laterUrl,
      title: `Website Change Detected — ${domain}`,
      rawContent: contentParts.join("\n"),
      publishedAt: comparison.laterDate,
      metadata: {
        source: "wayback",
        domain,
        earlierUrl: comparison.earlierUrl,
        laterUrl: comparison.laterUrl,
        earlierDate: comparison.earlierDate.toISOString(),
        laterDate: comparison.laterDate.toISOString(),
        digestChanged: String(comparison.digestChanged),
        significantChange: String(comparison.significantChange),
      },
    };
  }
}
