/**
 * openFDA scraper for tracking drug adverse events, device approvals, and recalls.
 *
 * Queries the openFDA public API endpoints for drug events, drug labels,
 * and device 510(k) clearances by company/manufacturer name.
 *
 * Signal value: regulatory milestones, safety issues, pipeline progress.
 *
 * No API key required. Rate limit: 240 requests/minute, 120,000 requests/day.
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const FDA_API_BASE = "https://api.fda.gov";

export interface DrugEvent {
  safetyReportId: string;
  receivedDate: string;
  serious: boolean;
  seriousnessDeaths: boolean;
  seriousnessHospitalization: boolean;
  reactions: string[];
  drugs: string[];
  company: string;
  url: string;
}

export interface DeviceClearance {
  kNumber: string;
  decisionDate: string;
  brandName: string;
  genericName: string;
  applicant: string;
  productCode: string;
  classification: string;
  url: string;
}

export interface FdaSignal {
  sourceUrl: string;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
  metadata: Record<string, string>;
}

export class FdaScraper extends BaseScraper {
  constructor() {
    // openFDA: 240 req/min = 4 req/s, 30s timeout, 3 retries, 6h cache
    super(4.0, 30000, 3, 21600);
  }

  override get scraperName(): string {
    return "fda-scraper";
  }

  /**
   * Search for drug adverse events by company/manufacturer name.
   * Returns signals for each adverse event report.
   */
  async scrapeDrugEvents(
    companyName: string,
    limit: number = 50,
  ): Promise<FdaSignal[]> {
    logger.info("fda.drugEvents.start", { companyName, limit });

    const events = await this.searchDrugEvents(companyName, limit);
    if (!events) {
      logger.error("fda.drugEvents.failed", { companyName });
      return [];
    }

    const signals = events.map((event) => this.drugEventToSignal(event));

    logger.info("fda.drugEvents.complete", {
      companyName,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Search for device 510(k) clearances by applicant/manufacturer name.
   * Returns signals for each device clearance.
   */
  async scrapeDeviceClearances(
    companyName: string,
    limit: number = 50,
  ): Promise<FdaSignal[]> {
    logger.info("fda.devices.start", { companyName, limit });

    const devices = await this.searchDeviceClearances(companyName, limit);
    if (!devices) {
      logger.error("fda.devices.failed", { companyName });
      return [];
    }

    const signals = devices.map((device) => this.deviceToSignal(device));

    logger.info("fda.devices.complete", {
      companyName,
      signalCount: signals.length,
    });

    return signals;
  }

  /**
   * Search openFDA drug events endpoint.
   */
  private async searchDrugEvents(
    companyName: string,
    limit: number,
  ): Promise<DrugEvent[] | null> {
    const params = new URLSearchParams({
      search: `openfda.manufacturer:"${companyName}"`,
      limit: String(limit),
    });

    const url = `${FDA_API_BASE}/drug/event.json?${params.toString()}`;
    const json = await this.fetch(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseDrugEvents(data);
    } catch (error) {
      logger.error("fda.drugEvents.parse.failed", {
        companyName,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Search openFDA device 510(k) endpoint.
   */
  private async searchDeviceClearances(
    companyName: string,
    limit: number,
  ): Promise<DeviceClearance[] | null> {
    const params = new URLSearchParams({
      search: `openfda.applicant:"${companyName}"`,
      limit: String(limit),
    });

    const url = `${FDA_API_BASE}/device/510k.json?${params.toString()}`;
    const json = await this.fetch(url);
    if (!json) return null;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      return this.parseDeviceClearances(data);
    } catch (error) {
      logger.error("fda.devices.parse.failed", {
        companyName,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Parse drug events from the openFDA response.
   */
  private parseDrugEvents(data: Record<string, unknown>): DrugEvent[] {
    const results = data.results as Array<Record<string, unknown>> | undefined;
    if (!results || !Array.isArray(results)) return [];

    return results
      .map((doc) => this.parseDrugEvent(doc))
      .filter((e): e is DrugEvent => e !== null);
  }

  /**
   * Parse a single drug event report.
   */
  private parseDrugEvent(doc: Record<string, unknown>): DrugEvent | null {
    const safetyReportId = this.str(doc.safetyreportid);
    const receivedDate = this.str(doc.receivedate);

    if (!safetyReportId) return null;

    const serious = doc.serious === "1" || doc.serious === 1;
    const seriousnessDeaths = doc.seriousnessdeath === "1" || doc.seriousnessdeath === 1;
    const seriousnessHospitalization = doc.seriousnesshospitalization === "1" || doc.seriousnesshospitalization === 1;

    const reactions = this.extractReactions(doc);
    const drugs = this.extractDrugs(doc);
    const company = this.extractManufacturer(doc);

    return {
      safetyReportId,
      receivedDate,
      serious,
      seriousnessDeaths,
      seriousnessHospitalization,
      reactions,
      drugs,
      company,
      url: `https://api.fda.gov/drug/event.json?search=safetyreportid:${safetyReportId}`,
    };
  }

  /**
   * Parse device clearances from the openFDA response.
   */
  private parseDeviceClearances(data: Record<string, unknown>): DeviceClearance[] {
    const results = data.results as Array<Record<string, unknown>> | undefined;
    if (!results || !Array.isArray(results)) return [];

    return results
      .map((doc) => this.parseDeviceClearance(doc))
      .filter((d): d is DeviceClearance => d !== null);
  }

  /**
   * Parse a single device 510(k) clearance.
   */
  private parseDeviceClearance(doc: Record<string, unknown>): DeviceClearance | null {
    const kNumber = this.str(doc.k_number);
    const decisionDate = this.str(doc.decision_date);

    if (!kNumber) return null;

    const brandName = this.str(doc.brand_name);
    const genericName = this.str(doc.generic_name);
    const applicant = this.str(doc.applicant);
    const productCode = this.str(doc.product_code);
    const classification = this.str(doc.third_party_flag === "Y" ? "Third Party" : "FDA");

    return {
      kNumber,
      decisionDate,
      brandName,
      genericName,
      applicant,
      productCode,
      classification,
      url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${kNumber}`,
    };
  }

  /**
   * Extract reaction terms from a drug event.
   */
  private extractReactions(doc: Record<string, unknown>): string[] {
    const patient = doc.patient as Record<string, unknown> | undefined;
    if (!patient) return [];

    const reactions = patient.reaction as Array<Record<string, unknown>> | undefined;
    if (!reactions || !Array.isArray(reactions)) return [];

    return reactions
      .map((r) => {
        const reactionMeddra = r.reactionmeddrapt as string | undefined;
        return reactionMeddra ?? "";
      })
      .filter((s) => s.length > 0);
  }

  /**
   * Extract drug names from a drug event.
   */
  private extractDrugs(doc: Record<string, unknown>): string[] {
    const patient = doc.patient as Record<string, unknown> | undefined;
    if (!patient) return [];

    const drugs = patient.drug as Array<Record<string, unknown>> | undefined;
    if (!drugs || !Array.isArray(drugs)) return [];

    return drugs
      .map((d) => {
        const medicinalProduct = d.medicinalproduct as string | undefined;
        return medicinalProduct ?? "";
      })
      .filter((s) => s.length > 0);
  }

  /**
   * Extract manufacturer name from a drug event.
   */
  private extractManufacturer(doc: Record<string, unknown>): string {
    const company = doc.company as Record<string, unknown> | undefined;
    if (!company) return "";

    return this.str(company.organization);
  }

  /**
   * Convert a DrugEvent into an FdaSignal.
   */
  private drugEventToSignal(event: DrugEvent): FdaSignal {
    const contentParts = [
      `Safety Report: ${event.safetyReportId}`,
      `Received: ${event.receivedDate}`,
      `Serious: ${event.serious ? "Yes" : "No"}`,
    ];

    if (event.seriousnessDeaths) contentParts.push("Outcome: Death");
    if (event.seriousnessHospitalization) contentParts.push("Outcome: Hospitalization");
    if (event.reactions.length > 0) {
      contentParts.push(`Reactions: ${event.reactions.join(", ")}`);
    }
    if (event.drugs.length > 0) {
      contentParts.push(`Drugs: ${event.drugs.join(", ")}`);
    }
    if (event.company) {
      contentParts.push(`Manufacturer: ${event.company}`);
    }

    return {
      sourceUrl: event.url,
      title: `Adverse Event Report ${event.safetyReportId} — ${event.company}`,
      rawContent: contentParts.join("\n"),
      publishedAt: event.receivedDate ? new Date(event.receivedDate) : null,
      metadata: {
        source: "fda",
        reportId: event.safetyReportId,
        serious: String(event.serious),
        deaths: String(event.seriousnessDeaths),
        hospitalization: String(event.seriousnessHospitalization),
        reactions: event.reactions.join(";"),
        drugs: event.drugs.join(";"),
      },
    };
  }

  /**
   * Convert a DeviceClearance into an FdaSignal.
   */
  private deviceToSignal(device: DeviceClearance): FdaSignal {
    const contentParts = [
      `510(k) Number: ${device.kNumber}`,
      `Decision Date: ${device.decisionDate}`,
      `Brand: ${device.brandName}`,
      `Generic: ${device.genericName}`,
      `Applicant: ${device.applicant}`,
    ];

    if (device.productCode) {
      contentParts.push(`Product Code: ${device.productCode}`);
    }
    if (device.classification) {
      contentParts.push(`Classification: ${device.classification}`);
    }

    return {
      sourceUrl: device.url,
      title: `Device Clearance ${device.kNumber} — ${device.brandName}`,
      rawContent: contentParts.join("\n"),
      publishedAt: device.decisionDate ? new Date(device.decisionDate) : null,
      metadata: {
        source: "fda",
        kNumber: device.kNumber,
        brandName: device.brandName,
        genericName: device.genericName,
        applicant: device.applicant,
        productCode: device.productCode,
      },
    };
  }

  private str(val: unknown): string {
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return String(val);
    return "";
  }
}
