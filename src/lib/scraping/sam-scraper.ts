/**
 * SAM.gov federal contract opportunities and awards scraper.
 *
 * Queries the SAM.gov Opportunities API to discover federal contract
 * opportunities, awards, and vendor activity by company name or UEI.
 *
 * Signal value: government revenue pipeline, contract wins/losses,
 * procurement trends, agency spending patterns.
 *
 * API key: Set SAM_API_KEY env var (free registration at sam.gov).
 * If no key is configured, the scraper gracefully returns empty results.
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const SAM_API_BASE = "https://sam.gov/api/prod/opps/v1/search";

export interface ContractOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber: string;
  agency: string;
  subAgency: string;
  postedDate: string;
  responseDate: string | null;
  awardDate: string | null;
  awardAmount: number | null;
  naicsCode: string;
  classificationCode: string;
  setAsideType: string;
  status: string;
  vendorName: string;
  uei: string;
  url: string;
}

export interface ContractAward {
  awardId: string;
  awardNumber: string;
  vendorName: string;
  uei: string;
  agency: string;
  awardedDate: string;
  awardAmount: number;
  description: string;
  naicsCode: string;
  url: string;
}

export interface SamSearchResult {
  query: string;
  totalResults: number;
  opportunities: ContractOpportunity[];
}

export interface SamSignal {
  sourceUrl: string;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
  metadata: Record<string, string>;
}

export class SamScraper extends BaseScraper {
  private apiKey: string | null;

  constructor() {
    // SAM.gov API: moderate rate limit, 30s timeout, 3 retries, 6h cache
    super(2.0, 30000, 3, 21600);
    this.apiKey = process.env.SAM_API_KEY ?? null;
  }

  /**
   * Whether the scraper is configured with an API key.
   */
  get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Search for contract opportunities by vendor name.
   * Returns signals for each opportunity found, or empty if not configured.
   */
  async scrapeByVendorName(
    vendorName: string,
    limit: number = 20,
  ): Promise<SamSignal[]> {
    if (!this.isConfigured) {
      logger.warn("sam.scraper.skipped", {
        reason: "SAM_API_KEY not configured",
      });
      return [];
    }

    logger.info("sam.scrape.start", { vendorName, limit });

    const opportunities = await this.searchOpportunities(vendorName, limit);
    if (!opportunities) {
      logger.error("sam.scrape.failed", { vendorName });
      return [];
    }

    const signals = opportunities.map((opp) => this.toSignal(opp));

    logger.info("sam.scrape.complete", {
      vendorName,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Search for contract opportunities by UEI (Unique Entity Identifier).
   * Returns signals for each opportunity found, or empty if not configured.
   */
  async scrapeByUei(
    uei: string,
    limit: number = 20,
  ): Promise<SamSignal[]> {
    if (!this.isConfigured) {
      logger.warn("sam.uei.skipped", {
        reason: "SAM_API_KEY not configured",
      });
      return [];
    }

    logger.info("sam.uei.start", { uei, limit });

    const opportunities = await this.searchByUei(uei, limit);
    if (!opportunities) {
      logger.error("sam.uei.failed", { uei });
      return [];
    }

    const signals = opportunities.map((opp) => this.toSignal(opp));

    logger.info("sam.uei.complete", {
      uei,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Search SAM.gov for contract opportunities by vendor name.
   */
  private async searchOpportunities(
    vendorName: string,
    limit: number,
  ): Promise<ContractOpportunity[] | null> {
    const params = new URLSearchParams({
      q: vendorName,
      limit: String(limit),
      offset: "0",
      sortby: "-modifiedDate",
      api_key: this.apiKey!,
    });

    const url = `${SAM_API_BASE}/opportunities?${params.toString()}`;
    const json = await this.fetchWithApiKey(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseOpportunities(data);
    } catch (error) {
      logger.error("sam.opportunities.parse.failed", {
        vendorName,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Search SAM.gov for contract opportunities by UEI.
   */
  private async searchByUei(
    uei: string,
    limit: number,
  ): Promise<ContractOpportunity[] | null> {
    const params = new URLSearchParams({
      uei: uei,
      limit: String(limit),
      offset: "0",
      sortby: "-modifiedDate",
      api_key: this.apiKey!,
    });

    const url = `${SAM_API_BASE}/opportunities?${params.toString()}`;
    const json = await this.fetchWithApiKey(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseOpportunities(data);
    } catch (error) {
      logger.error("sam.uei.parse.failed", {
        uei,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Fetch a URL with the SAM.gov API key appended as a query parameter.
   * Uses the base fetch method since the key is already in the URL.
   */
  private async fetchWithApiKey(url: string): Promise<string | null> {
    return this.fetch(url);
  }

  /**
   * Parse the API response into ContractOpportunity array.
   */
  private parseOpportunities(
    data: Record<string, unknown>,
  ): ContractOpportunity[] {
    const opportunitiesList =
      (data.opportunitiesData as Array<Record<string, unknown>>) ??
      (data.results as Array<Record<string, unknown>>) ??
      (data.opportunities as Array<Record<string, unknown>>);

    if (!opportunitiesList || !Array.isArray(opportunitiesList)) return [];

    return opportunitiesList
      .map((doc) => this.parseOpportunity(doc))
      .filter((o): o is ContractOpportunity => o !== null);
  }

  /**
   * Parse a single contract opportunity from the API response.
   */
  private parseOpportunity(
    doc: Record<string, unknown>,
  ): ContractOpportunity | null {
    const noticeId = this.str(doc.noticeId ?? doc.id);
    const title = this.str(doc.title);

    if (!noticeId) return null;

    const solicitationNumber = this.str(
      doc.solicitationNumber ?? doc.solnum ?? doc.noticeNumber,
    );
    const agency = this.str(doc.agency ?? doc.department);
    const subAgency = this.str(doc.subAgency ?? doc.subDepartment ?? "");
    const postedDate = this.str(doc.postedDate ?? doc.createdOn ?? doc.date);
    const responseDate = this.str(doc.responseDate ?? doc.responseDeadline ?? "");
    const awardDate = this.str(doc.awardDate ?? doc.awardedDate ?? "");
    const awardAmount = this.parseAwardAmount(doc);
    const naicsCode = this.str(doc.naicsCode ?? doc.naics ?? "");
    const classificationCode = this.str(
      doc.classificationCode ?? doc.classCode ?? "",
    );
    const setAsideType = this.str(doc.setAsideType ?? doc.setAside ?? "");
    const status = this.str(doc.status ?? doc.opportunityStatus ?? "");
    const vendorName = this.str(doc.vendorName ?? doc.awardeeName ?? "");
    const uei = this.str(doc.uei ?? doc.awardeeUEI ?? "");

    const url =
      this.str(doc.url) ||
      `https://sam.gov/opp/${noticeId}/view`;

    return {
      noticeId,
      title,
      solicitationNumber,
      agency,
      subAgency,
      postedDate,
      responseDate: responseDate || null,
      awardDate: awardDate || null,
      awardAmount,
      naicsCode,
      classificationCode,
      setAsideType,
      status,
      vendorName,
      uei,
      url,
    };
  }

  /**
   * Parse award amount from various possible fields.
   */
  private parseAwardAmount(doc: Record<string, unknown>): number | null {
    const raw =
      doc.awardAmount ??
      doc.totalAwardAmount ??
      doc.amount ??
      doc.awardedAmount;

    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const cleaned = raw.replace(/[$,]/g, "");
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  /**
   * Convert a ContractOpportunity into a SamSignal for downstream processing.
   */
  private toSignal(opp: ContractOpportunity): SamSignal {
    const contentParts = [
      `Opportunity: ${opp.title}`,
      `Solicitation: ${opp.solicitationNumber}`,
      `Agency: ${opp.agency}`,
      `Posted: ${opp.postedDate}`,
      `Status: ${opp.status}`,
    ];

    if (opp.subAgency) {
      contentParts.push(`Sub-Agency: ${opp.subAgency}`);
    }
    if (opp.responseDate) {
      contentParts.push(`Response Deadline: ${opp.responseDate}`);
    }
    if (opp.awardDate) {
      contentParts.push(`Award Date: ${opp.awardDate}`);
    }
    if (opp.awardAmount !== null) {
      contentParts.push(
        `Award Amount: $${opp.awardAmount.toLocaleString()}`,
      );
    }
    if (opp.vendorName) {
      contentParts.push(`Vendor: ${opp.vendorName}`);
    }
    if (opp.uei) {
      contentParts.push(`UEI: ${opp.uei}`);
    }
    if (opp.naicsCode) {
      contentParts.push(`NAICS: ${opp.naicsCode}`);
    }
    if (opp.setAsideType) {
      contentParts.push(`Set-Aside: ${opp.setAsideType}`);
    }

    const dateStr = opp.awardDate || opp.postedDate;

    return {
      sourceUrl: opp.url,
      title: `${opp.title} — ${opp.agency}`,
      rawContent: contentParts.join("\n"),
      publishedAt: dateStr ? new Date(dateStr) : null,
      metadata: {
        source: "sam",
        noticeId: opp.noticeId,
        solicitationNumber: opp.solicitationNumber,
        agency: opp.agency,
        status: opp.status,
        vendorName: opp.vendorName,
        uei: opp.uei,
        naicsCode: opp.naicsCode,
        awardAmount: opp.awardAmount !== null ? String(opp.awardAmount) : "",
      },
    };
  }

  private str(val: unknown): string {
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return String(val);
    return "";
  }
}
