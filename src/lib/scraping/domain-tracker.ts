/**
 * Domain registration tracker for monitoring new domain acquisitions.
 * Detects when companies register new domains that may signal upcoming
 * product launches, brand extensions, or strategic initiatives.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface DomainRegistration {
  url: string;
  domain: string;
  registrant: string;
  registeredAt: Date;
  registrar: string;
  nameServers: string[];
}

export class DomainTracker extends BaseScraper {
  constructor() {
    super(0.5, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "domain-tracker";
  }

  async scrapeDomains(companyName: string): Promise<DomainRegistration[] | null> {
    const domains: DomainRegistration[] = [];

    // Search for recent domain registrations by company
    const searchUrl = `https://whois.domaintools.com/search/?q=${encodeURIComponent(companyName)}`;

    try {
      const html = await this.fetch(searchUrl);
      if (!html) return null;

      const $ = cheerio.load(html);
      const results = $(".whois-list-item, .search-result, .domain-result").toArray();

      for (const result of results.slice(0, 10)) {
        const $result = $(result);
        const domain = $result.find(".domain-name, h3, .title").first().text().trim();
        const registrant = $result.find(".registrant, .owner").first().text().trim();
        const dateText = $result.find(".created-date, .registration-date, time").first().text().trim();
        const registrar = $result.find(".registrar").first().text().trim();
        const nameServers = $result.find(".name-servers, .ns").text().trim().split(",").map((s) => s.trim());

        if (!domain || !registrant) continue;

        // Filter by company name
        if (!registrant.toLowerCase().includes(companyName.toLowerCase())) {
          continue;
        }

        domains.push({
          url: `https://whois.domaintools.com/${domain}`,
          domain,
          registrant,
          registeredAt: this.parseDate(dateText),
          registrar,
          nameServers,
        });
      }

      logger.info("Scraped domain registrations", {
        company: companyName,
        count: domains.length,
      });

      return domains.length > 0 ? domains : null;
    } catch (error) {
      logger.error("Failed to scrape domain registrations", {
        company: companyName,
        error: String(error),
      });
      return null;
    }
  }

  private parseDate(text: string): Date {
    const date = new Date(text);
    return isNaN(date.getTime()) ? new Date() : date;
  }
}
