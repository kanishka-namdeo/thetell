/**
 * Lobbying disclosure scraper for Senate LDA database.
 * Extracts lobbying filings to identify corporate policy influence strategies.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface LobbyingDisclosure {
  url: string;
  company: string;
  registrant: string;
  issue: string;
  amount: number | null;
  period: string;
  filedAt: Date;
}

export class LobbyingScraper extends BaseScraper {
  constructor() {
    super(0.5, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "lobbying-scraper";
  }

  async scrapeLobbying(companyName: string): Promise<LobbyingDisclosure[] | null> {
    const searchUrl = `https://lda.senate.gov/system/public/`;
    
    try {
      const html = await this.fetch(searchUrl);
      if (!html) return null;

      const $ = cheerio.load(html);
      const disclosures: LobbyingDisclosure[] = [];

      // Parse lobbying disclosure table
      $("table tbody tr").each((_, element) => {
        const cells = $(element).find("td");
        if (cells.length < 5) return;

        const registrant = $(cells[0]).text().trim();
        const issue = $(cells[1]).text().trim();
        const amountText = $(cells[2]).text().trim();
        const period = $(cells[3]).text().trim();
        const filedText = $(cells[4]).text().trim();
        const link = $(cells[0]).find("a").attr("href");

        // Filter by company name
        if (!registrant.toLowerCase().includes(companyName.toLowerCase())) {
          return;
        }

        const amount = this.parseAmount(amountText);
        const filedAt = this.parseDate(filedText);

        if (link) {
          disclosures.push({
            url: link.startsWith("http") ? link : `https://lda.senate.gov${link}`,
            company: companyName,
            registrant,
            issue,
            amount,
            period,
            filedAt,
          });
        }
      });

      logger.info("Scraped lobbying disclosures", {
        company: companyName,
        count: disclosures.length,
      });

      return disclosures;
    } catch (error) {
      logger.error("Failed to scrape lobbying disclosures", {
        company: companyName,
        error: String(error),
      });
      return null;
    }
  }

  private parseAmount(text: string): number | null {
    const match = text.match(/\$?([\d,]+)/);
    if (!match) return null;
    return parseInt(match[1].replace(/,/g, ""), 10);
  }

  private parseDate(text: string): Date {
    const date = new Date(text);
    return isNaN(date.getTime()) ? new Date() : date;
  }
}
