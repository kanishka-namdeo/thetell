/**
 * SEC EDGAR filing scraper for automated signal discovery.
 * Queries SEC's public API for recent company filings.
 *
 * Supports a broad range of SEC filing types:
 * - 10-K, 10-Q, 8-K, 6-K (financial reports & current events)
 * - 13F (institutional holdings disclosures)
 * - Form 4 (insider trading transactions)
 * - DEF 14A (proxy statements)
 * - S-1, S-3 (registration statements / IPOs)
 */

import { BaseScraper } from "./base-scraper";
import { logger } from "@/lib/logger";

export interface Filing {
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  form: string;
  filingUrl: string;
  primaryDocument: string;
  primaryDocUrl: string;
  description: string;
}

export interface FilingMetadata {
  companyName: string;
  cik: string;
  filings: Filing[];
}

/**
 * All SEC filing types tracked by The Tell.
 * Each type provides distinct strategic intelligence value.
 */
const TRACKED_FILING_TYPES = [
  "10-K",    // Annual report — full financial picture
  "10-Q",    // Quarterly report — periodic financials
  "8-K",     // Current report — material events
  "6-K",     // Foreign private issuer current report
  "13F",     // Institutional holdings — what big funds own
  "4",       // Insider transactions — officer/director trades
  "DEF 14A", // Proxy statements — executive comp, governance
  "S-1",     // Registration statement — IPO filings
  "S-3",     // Shelf registration — secondary offerings
  "SC 13D",  // Beneficial ownership — activist stakes >5%
  "SC 13G",  // Passive beneficial ownership >5%
] as const;

export type TrackedFilingType = (typeof TRACKED_FILING_TYPES)[number];

export class FilingScraper extends BaseScraper {
  constructor() {
    // SEC EDGAR is rate-limited to 10 requests/second
    super(10.0, 30000, 3, 3600); // 1 hour cache TTL
  }

  override get scraperName(): string {
    return "filing-scraper";
  }

  /**
   * Fetch recent filings for a company by CIK from SEC EDGAR.
   * CIK must be 10 digits (zero-padded).
   */
  async scrapeFilingsByCik(cik: string): Promise<FilingMetadata | null> {
    const paddedCik = cik.padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    logger.info("Scraping SEC EDGAR filings", { cik, paddedCik });

    const json = await this.fetch(url);
    if (!json) {
      logger.error("Failed to fetch SEC EDGAR data", { cik });
      return null;
    }

    try {
      const data = JSON.parse(json);
      return this.parseFilingData(data);
    } catch (error) {
      logger.error("Failed to parse SEC EDGAR data", {
        cik,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Fetch recent filings for a company by name using EDGAR full-text search.
   * Queries all tracked filing types (10-K, 10-Q, 8-K, 6-K, 13F, Form 4,
   * DEF 14A, S-1, S-3, SC 13D, SC 13G).
   */
  async scrapeFilingsByCompanyName(
    companyName: string
  ): Promise<FilingMetadata | null> {
    const encodedName = encodeURIComponent(companyName);
    const forms = TRACKED_FILING_TYPES.join(",");
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodedName}%22&dateRange=custom&startdt=${this.getDateDaysAgo(30)}&enddt=${this.getDateToday()}&forms=${forms}`;

    logger.info("Searching SEC EDGAR by company name", { companyName });

    const json = await this.fetch(url);
    if (!json) {
      logger.error("Failed to search SEC EDGAR", { companyName });
      return null;
    }

    try {
      const data = JSON.parse(json);
      return this.parseSearchResults(data, companyName);
    } catch (error) {
      logger.error("Failed to parse SEC EDGAR search results", {
        companyName,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Scrape a specific SEC filing document by its URL.
   *
   * Accepts URLs in these formats:
   * - Filing index: https://www.sec.gov/Archives/edgar/data/{CIK}/{accession}/
   * - Direct document: https://www.sec.gov/Archives/edgar/data/{CIK}/{accession}/{doc}
   * - Full-text search result URL
   *
   * Extracts the filing metadata (form type, date, company) from the URL
   * and fetches the document content.
   */
  async scrapeArticle(url: string): Promise<{
    title: string;
    bodyText: string;
    publishedAt: Date | null;
  } | null> {
    const parsed = this.parseFilingUrl(url);
    if (!parsed) {
      logger.warn("Could not parse SEC filing URL", { url });
      return null;
    }

    logger.info("Scraping SEC filing document", {
      url,
      cik: parsed.cik,
      accessionNumber: parsed.accessionNumber,
    });

    // If we have a CIK and accession number, fetch the filing index page
    if (parsed.cik && parsed.accessionNumber) {
      const filingIndexUrl = `https://www.sec.gov/Archives/edgar/data/${parsed.cik}/${parsed.accessionNumber}/index.json`;
      const indexJson = await this.fetch(filingIndexUrl);

      if (indexJson) {
        try {
          const indexData = JSON.parse(indexJson);
          const filing = this.extractFilingFromIndex(indexData, parsed);
          if (filing) return filing;
        } catch (error) {
          logger.error("Failed to parse filing index", {
            filingIndexUrl,
            error: String(error),
          });
        }
      }
    }

    // Fallback: fetch the document URL directly and extract text
    const html = await this.fetch(url);
    if (!html) {
      logger.error("Failed to fetch filing document", { url });
      return null;
    }

    const title = `SEC Filing ${parsed.accessionNumber ? `(${parsed.accessionNumber})` : ""}`;
    const bodyText = this.extractTextFromHtml(html);
    const publishedAt = parsed.filingDate
      ? new Date(parsed.filingDate)
      : null;

    return { title, bodyText, publishedAt };
  }

  /**
   * Parse a SEC EDGAR URL to extract CIK, accession number, and filing date.
   *
   * Supported URL patterns:
   * - /Archives/edgar/data/{CIK}/{accessionNumber}/...
   * - /Archives/edgar/data/{CIK}/{accessionNumber}/{document}
   */
  private parseFilingUrl(url: string): {
    cik: string;
    accessionNumber: string;
    filingDate: string | null;
  } | null {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split("/").filter(Boolean);

      // Pattern: /Archives/edgar/data/{CIK}/{accession}/...
      const dataIdx = pathParts.indexOf("data");
      if (dataIdx === -1 || dataIdx + 2 >= pathParts.length) {
        return null;
      }

      const cik = pathParts[dataIdx + 1];
      const accessionRaw = pathParts[dataIdx + 2];

      // Accession numbers in URLs may have dashes stripped (e.g., 000032019321000108)
      // or have dashes (e.g., 0000320193-21-000108). Normalize to dashed form.
      const accessionNumber = this.normalizeAccessionNumber(accessionRaw);

      // Try to extract filing date from the accession number
      // Format: XXXXXXXXXX-YY-NNNNNN where YY is the year
      let filingDate: string | null = null;
      const dashMatch = accessionNumber.match(/^\d+-(\d{2})-\d+$/);
      if (dashMatch) {
        const year = parseInt(dashMatch[1], 10);
        const fullYear = year >= 90 ? 1900 + year : 2000 + year;
        filingDate = `${fullYear}-01-01`; // Approximate; real date comes from index
      }

      return { cik, accessionNumber, filingDate };
    } catch {
      return null;
    }
  }

  /**
   * Normalize an accession number to the dashed format (XXXXXXXXXX-YY-NNNNNN).
   */
  private normalizeAccessionNumber(raw: string): string {
    // Already dashed
    if (raw.includes("-")) {
      return raw;
    }

    // Strip dashes form: 000032019321000108 -> 0000320193-21-000108
    if (raw.length === 18) {
      return `${raw.slice(0, 10)}-${raw.slice(10, 12)}-${raw.slice(12)}`;
    }

    return raw;
  }

  /**
   * Extract filing info from an EDGAR filing index JSON response.
   */
  private extractFilingFromIndex(
    indexData: Record<string, unknown>,
    parsed: { cik: string; accessionNumber: string; filingDate: string | null }
  ): { title: string; bodyText: string; publishedAt: Date | null } | null {
    const directory = indexData.directory as Record<string, unknown> | undefined;
    const items = directory?.item as Array<Record<string, unknown>> | undefined;

    if (!items || items.length === 0) {
      return null;
    }

    // Find the primary filing document (usually the first .htm or .html file)
    const primaryDoc = items.find(
      (item) =>
        typeof item.name === "string" &&
        (item.name.endsWith(".htm") || item.name.endsWith(".html"))
    );

    const formType =
      (directory?.type as string) ||
      (primaryDoc?.type as string) ||
      "SEC Filing";

    const filingDate =
      (directory?.filingDate as string) || parsed.filingDate || null;

    const companyName =
      (directory?.name as string) || `CIK ${parsed.cik}`;

    const title = `${formType} - ${companyName}${filingDate ? ` (${filingDate})` : ""}`;

    // Build a summary from the index items
    const docDescriptions = items
      .filter((item) => typeof item.description === "string" && item.description)
      .map((item) => `- ${item.description} (${item.name})`)
      .join("\n");

    const bodyText =
      `SEC Filing: ${formType}\nCompany: ${companyName}\nFiled: ${filingDate || "Unknown"}\nAccession: ${parsed.accessionNumber}\n\nDocuments:\n${docDescriptions}`;

    const publishedAt = filingDate ? new Date(filingDate) : null;

    return { title, bodyText, publishedAt };
  }

  /**
   * Extract readable text from HTML filing documents.
   * Strips tags and collapses whitespace.
   */
  private extractTextFromHtml(html: string): string {
    // Remove script/style blocks
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, " ");
    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    // Collapse whitespace
    text = text.replace(/\s+/g, " ").trim();

    // Truncate to reasonable size for analysis
    const maxLength = 50000;
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + "...";
    }

    return text;
  }

  /**
   * Parse SEC EDGAR submissions JSON and extract recent filings.
   */
  private parseFilingData(data: Record<string, unknown>): FilingMetadata {
    const companyName = (data.name as string) || "Unknown";
    const cik = (data.cik as string | number)?.toString() || "";

    const recentFilings: Filing[] = [];

    // recentFilings array contains the most recent submissions
    const filings = data.filings as Record<string, unknown> | undefined;
    if (filings?.recent) {
      const recent = filings.recent as Record<string, string[]>;
      const count = Math.min(recent.accessionNumber?.length || 0, 80);

      for (let i = 0; i < count; i++) {
        const accessionNumber = recent.accessionNumber[i];
        const form = recent.form[i];
        const filingDate = recent.filingDate[i];
        const reportDate = recent.reportDate?.[i] || null;
        const primaryDocument = recent.primaryDocument[i];
        const accessionClean = accessionNumber.replace(/-/g, "");
        const primaryDocUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionClean}/${primaryDocument}`;
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionClean}`;

        recentFilings.push({
          accessionNumber,
          filingDate,
          reportDate,
          form,
          filingUrl,
          primaryDocument,
          primaryDocUrl,
          description: `${form} filed ${filingDate}`,
        });
      }
    }

    logger.info("Parsed SEC EDGAR filings", {
      cik,
      companyName,
      filingCount: recentFilings.length,
    });

    return {
      companyName,
      cik,
      filings: recentFilings,
    };
  }

  /**
   * Parse SEC EDGAR search results (full-text search API).
   */
  private parseSearchResults(
    data: Record<string, unknown>,
    companyName: string
  ): FilingMetadata {
    const filings: Filing[] = [];

    // EFTS search results structure
    const hits = data.hits as Record<string, unknown> | undefined;
    if (hits?.hits) {
      const hitsArray = hits.hits as Array<Record<string, unknown>>;
      for (const hit of hitsArray) {
        const source = hit._source as Record<string, unknown> | undefined;
        if (!source) continue;

        const accessionNumber = (source.accession_no as string) || "";
        const form = (source.form_type as string) || "";
        const filingDate = (source.file_date as string) || "";
        const reportDate = (source.report_date as string) || null;
        const filingUrl = (source.url as string) || "";
        const htmlDocs = source.html_docs as string[] | undefined;
        const primaryDocument = htmlDocs?.[0] || "";

        filings.push({
          accessionNumber,
          filingDate,
          reportDate,
          form,
          filingUrl,
          primaryDocument,
          primaryDocUrl: filingUrl,
          description: `${form} filed ${filingDate}`,
        });
      }
    }

    logger.info("Parsed SEC EDGAR search results", {
      companyName,
      filingCount: filings.length,
    });

    return {
      companyName,
      cik: "",
      filings,
    };
  }

  /**
   * Get date string in YYYY-MM-DD format for N days ago.
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split("T")[0];
  }

  /**
   * Get today's date in YYYY-MM-DD format.
   */
  private getDateToday(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * Fetch the full text content of a specific filing document.
   * Useful for extracting text from 8-K items, 10-K exhibits, etc.
   */
  async scrapeFilingContent(docUrl: string): Promise<string | null> {
    logger.info("Scraping filing document content", { docUrl });

    const html = await this.fetch(docUrl);
    if (!html) {
      logger.error("Failed to fetch filing document", { docUrl });
      return null;
    }

    return this.extractTextFromHtml(html);
  }
}
