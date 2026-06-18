/**
 * Congress.gov legislative scraper for tracking regulatory exposure.
 * Uses the free Congress.gov API (api.data.gov registration required).
 * 
 * Signal value: regulatory exposure, lobbying targets, legislation affecting industries.
 * Rate limit: 5,000 requests/hour (with API key).
 * 
 * @see https://api.congress.gov/
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

const CongressBillSchema = z.object({
  number: z.string(),
  title: z.string(),
  shortTitle: z.string().optional(),
  introducedDate: z.string().optional(),
  latestAction: z.object({
   actionDate: z.string(),
    text: z.string(),
  }).optional(),
  policyArea: z.object({
    name: z.string(),
  }).optional(),
  subjects: z.array(z.object({
    name: z.string(),
  })).optional(),
  sponsors: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
    party: z.string().optional(),
    state: z.string().optional(),
  })).optional(),
  cosponsors: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
  })).optional(),
  committees: z.array(z.object({
    name: z.string(),
    activity: z.array(z.string()).optional(),
  })).optional(),
  summaries: z.array(z.object({
    text: z.string(),
    versionCode: z.string().optional(),
  })).optional(),
  versions: z.array(z.object({
    versionCode: z.string(),
    links: z.array(z.object({
      rel: z.string(),
      url: z.string(),
    })).optional(),
  })).optional(),
});

const CongressCommitteeReportSchema = z.object({
  number: z.string(),
  congress: z.number(),
  sessionNumber: z.number(),
  title: z.string().optional(),
  reportDate: z.string().optional(),
  issuedHouse: z.string().optional(),
  chamber: z.string().optional(),
  pdfUrl: z.string().optional(),
  textUrl: z.string().optional(),
});

const CongressRecordEntrySchema = z.object({
  volume: z.number().optional(),
  issue: z.string().optional(),
  date: z.string().optional(),
  pages: z.array(z.object({
    page: z.string(),
    section: z.string().optional(),
  })).optional(),
  title: z.string().optional(),
  type: z.string().optional(),
  textUrl: z.string().optional(),
});

export type CongressBill = z.infer<typeof CongressBillSchema>;
export type CongressCommitteeReport = z.infer<typeof CongressCommitteeReportSchema>;
export type CongressRecordEntry = z.infer<typeof CongressRecordEntrySchema>;

export interface CongressSignal {
  id: string;
  type: "bill" | "committee_report" | "congressional_record";
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string;
  metadata: {
    congress: number;
    session: number;
    sponsors: string[];
    policyArea?: string;
    subjects: string[];
    committees: string[];
    latestAction?: {
      date: string;
      text: string;
    };
  };
}

export interface CongressSearchOptions {
  query: string;
  congress?: number;
  fromDateTime?: string;
  toDateTime?: string;
  limit?: number;
  offset?: number;
}

export class CongressScraper extends BaseScraper {
  private apiKey: string | null;

  constructor() {
    super(1.0, 30000, 3, 3600);
    this.apiKey = process.env.CONGRESS_API_KEY || null;
    
    if (!this.apiKey) {
      logger.warn("Congress API key not configured - scraper will be disabled", {
        envVar: "CONGRESS_API_KEY",
      });
    }
  }

  /**
   * Check if the scraper is properly configured.
   */
  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Search for bills by keyword.
   * Returns an array of CongressSignal objects.
   */
  async searchBills(options: CongressSearchOptions): Promise<CongressSignal[]> {
    if (!this.isConfigured()) {
      logger.warn("Congress scraper not configured - skipping search");
      return [];
    }

    const { query, congress, fromDateTime, toDateTime, limit = 20, offset = 0 } = options;
    
    const params = new URLSearchParams({
      query,
      limit: String(Math.min(limit, 50)),
      offset: String(offset),
    });

    if (congress) {
      params.set("congress", String(congress));
    }
    if (fromDateTime) {
      params.set("fromDateTime", fromDateTime);
    }
    if (toDateTime) {
      params.set("toDateTime", toDateTime);
    }

    const url = `${CONGRESS_API_BASE}/bill?${params.toString()}&api_key=${this.apiKey}`;
    
    logger.info("Searching Congress.gov bills", { query, congress, limit });

    const text = await this.fetch(url);
    if (!text) {
      return [];
    }

    try {
      const data = JSON.parse(text) as {
        bills?: Array<{
          congress: number;
          session: number;
          number: string;
          title: string;
          shortTitle?: string;
          introducedDate?: string;
          latestAction?: {
            actionDate: string;
            text: string;
          };
          policyArea?: { name: string };
          subjects?: Array<{ name: string }>;
          sponsors?: Array<{
            firstName: string;
            lastName: string;
            party?: string;
            state?: string;
          }>;
          committees?: Array<{
            name: string;
            activity?: string[];
          }>;
        }>;
      };

      if (!data.bills) {
        return [];
      }

      return data.bills.map((bill) => this.mapBillToSignal(bill));
    } catch (error) {
      logger.error("Failed to parse Congress.gov response", { error: String(error) });
      return [];
    }
  }

  /**
   * Get detailed information about a specific bill.
   */
  async getBill(congress: number, billType: string, billNumber: string): Promise<CongressSignal | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const url = `${CONGRESS_API_BASE}/${congress}/${billType}/${billNumber}?api_key=${this.apiKey}`;
    
    logger.debug("Fetching bill details", { congress, billType, billNumber });

    const text = await this.fetch(url);
    if (!text) {
      return null;
    }

    try {
      const data = JSON.parse(text) as { bill?: CongressBill & { congress: number; session: number } };
      
      if (!data.bill) {
        return null;
      }

      return this.mapBillToSignal(data.bill);
    } catch (error) {
      logger.error("Failed to parse bill details", { error: String(error) });
      return null;
    }
  }

  /**
   * Search for committee reports by keyword.
   */
  async searchCommitteeReports(options: CongressSearchOptions): Promise<CongressSignal[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const { query, congress, limit = 20, offset = 0 } = options;
    
    const params = new URLSearchParams({
      query,
      limit: String(Math.min(limit, 50)),
      offset: String(offset),
    });

    if (congress) {
      params.set("congress", String(congress));
    }

    const url = `${CONGRESS_API_BASE}/committee-report?${params.toString()}&api_key=${this.apiKey}`;
    
    logger.info("Searching Congress.gov committee reports", { query, congress, limit });

    const text = await this.fetch(url);
    if (!text) {
      return [];
    }

    try {
      const data = JSON.parse(text) as {
        committeeReports?: Array<CongressCommitteeReport & { congress: number }>;
      };

      if (!data.committeeReports) {
        return [];
      }

      return data.committeeReports.map((report) => this.mapReportToSignal(report));
    } catch (error) {
      logger.error("Failed to parse committee reports response", { error: String(error) });
      return [];
    }
  }

  /**
   * Search the Congressional Record by keyword.
   */
  async searchCongressionalRecord(options: CongressSearchOptions): Promise<CongressSignal[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const { query, congress, fromDateTime, toDateTime, limit = 20, offset = 0 } = options;
    
    const params = new URLSearchParams({
      query,
      limit: String(Math.min(limit, 50)),
      offset: String(offset),
    });

    if (congress) {
      params.set("congress", String(congress));
    }
    if (fromDateTime) {
      params.set("fromDateTime", fromDateTime);
    }
    if (toDateTime) {
      params.set("toDateTime", toDateTime);
    }

    const url = `${CONGRESS_API_BASE}/congressional-record?${params.toString()}&api_key=${this.apiKey}`;
    
    logger.info("Searching Congressional Record", { query, congress, limit });

    const text = await this.fetch(url);
    if (!text) {
      return [];
    }

    try {
      const data = JSON.parse(text) as {
        results?: Array<CongressRecordEntry & { congress: number; session: number }>;
      };

      if (!data.results) {
        return [];
      }

      return data.results.map((entry) => this.mapRecordToSignal(entry));
    } catch (error) {
      logger.error("Failed to parse Congressional Record response", { error: String(error) });
      return [];
    }
  }

  /**
   * Main scrape method - searches all sources for a query.
   * Returns combined signals from bills, reports, and record entries.
   */
  async scrape(query: string, options?: Omit<CongressSearchOptions, "query">): Promise<CongressSignal[]> {
    if (!this.isConfigured()) {
      logger.warn("Congress scraper not configured - skipping scrape");
      return [];
    }

    const searchOptions = { query, ...options };

    const [bills, reports, records] = await Promise.all([
      this.searchBills(searchOptions),
      this.searchCommitteeReports(searchOptions),
      this.searchCongressionalRecord(searchOptions),
    ]);

    const allSignals = [...bills, ...reports, ...records];

    logger.info("Congress.gov scrape complete", {
      query,
      bills: bills.length,
      reports: reports.length,
      records: records.length,
      total: allSignals.length,
    });

    return allSignals;
  }

  private mapBillToSignal(bill: CongressBill & { congress: number; session: number }): CongressSignal {
    const title = bill.shortTitle || bill.title;
    const summary = this.buildBillSummary(bill);
    const sponsors = (bill.sponsors || []).map(
      (s) => `${s.firstName} ${s.lastName}${s.party ? ` (${s.party})` : ""}`
    );
    const subjects = (bill.subjects || []).map((s) => s.name);
    const committees = (bill.committees || []).map((c) => c.name);

    return {
      id: `congress-bill-${bill.congress}-${bill.number}`,
      type: "bill",
      title,
      url: `https://www.congress.gov/bill/${bill.congress}th-congress/${bill.number.toLowerCase()}`,
      publishedAt: bill.introducedDate ? new Date(bill.introducedDate) : null,
      summary,
      metadata: {
        congress: bill.congress,
        session: bill.session,
        sponsors,
        policyArea: bill.policyArea?.name,
        subjects,
        committees,
        latestAction: bill.latestAction ? {
          date: bill.latestAction.actionDate,
          text: bill.latestAction.text,
        } : undefined,
      },
    };
  }

  private mapReportToSignal(report: CongressCommitteeReport & { congress: number }): CongressSignal {
    const title = report.title || `Committee Report ${report.number}`;
    
    return {
      id: `congress-report-${report.congress}-${report.number}`,
      type: "committee_report",
      title,
      url: `https://www.congress.gov/committee-report/${report.congress}/${report.number}`,
      publishedAt: report.reportDate ? new Date(report.reportDate) : null,
      summary: `Committee report from the ${report.chamber || "Congress"}.`,
      metadata: {
        congress: report.congress,
        session: report.sessionNumber,
        sponsors: [],
        subjects: [],
        committees: report.issuedHouse ? [report.issuedHouse] : [],
      },
    };
  }

  private mapRecordToSignal(entry: CongressRecordEntry & { congress: number; session: number }): CongressSignal {
    const title = entry.title || `Congressional Record Entry ${entry.date || ""}`;
    const pages = (entry.pages || []).map((p) => p.page).join(", ");
    
    return {
      id: `congress-record-${entry.date || "unknown"}-${pages}`,
      type: "congressional_record",
      title,
      url: `https://www.congress.gov/congressional-record/${entry.date}`,
      publishedAt: entry.date ? new Date(entry.date) : null,
      summary: `Congressional Record entry${entry.type ? ` (${entry.type})` : ""}.`,
      metadata: {
        congress: entry.congress,
        session: entry.session,
        sponsors: [],
        subjects: [],
        committees: [],
      },
    };
  }

  private buildBillSummary(bill: CongressBill): string {
    const parts: string[] = [];

    if (bill.latestAction) {
      parts.push(`Latest action: ${bill.latestAction.text}`);
    }

    if (bill.policyArea) {
      parts.push(`Policy area: ${bill.policyArea.name}`);
    }

    if (bill.subjects && bill.subjects.length > 0) {
      const subjectNames = bill.subjects.slice(0, 5).map((s) => s.name).join(", ");
      parts.push(`Subjects: ${subjectNames}`);
    }

    return parts.join(" | ") || "Legislative bill.";
  }
}
