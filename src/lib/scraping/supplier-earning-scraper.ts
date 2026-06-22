/**
 * Supplier earnings scraper for supply chain intelligence.
 * Monitors earnings reports from key suppliers (TSMC, Foxconn, Samsung)
 * to extract signals about customer demand and production volumes.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface SupplierEarning {
  url: string;
  supplier: string;
  quarter: string;
  year: number;
  publishedAt: Date;
  customerMentions: Array<{
    customer: string;
    context: string;
    sentiment: "positive" | "negative" | "neutral";
  }>;
  revenueGuidance?: string;
  capacityNotes?: string;
}

export class SupplierEarningScraper extends BaseScraper {
  override get scraperName(): string {
    return "supplier-earning-scraper";
  }

  private readonly SUPPLIERS = [
    {
      name: "TSMC",
      earningsUrl: "https://www.tsmc.com/english/newsAndEvents/pressReleases",
      customers: ["Apple", "NVIDIA", "AMD", "Qualcomm", "Broadcom"],
    },
    {
      name: "Foxconn",
      earningsUrl: "https://www.foxconn.com/en-us/investor/financial-information/quarterly-results",
      customers: ["Apple", "Dell", "HP", "Cisco"],
    },
    {
      name: "Samsung Electronics",
      earningsUrl: "https://www.samsung.com/global/ir/earnings/",
      customers: ["Apple", "Google", "Microsoft", "Qualcomm"],
    },
  ];

  constructor() {
    super(0.5, 30000, 3, 86400, true);
  }

  async scrapeEarnings(customerName: string): Promise<SupplierEarning[] | null> {
    const earnings: SupplierEarning[] = [];

    for (const supplier of this.SUPPLIERS) {
      if (!supplier.customers.includes(customerName)) {
        continue;
      }

      try {
        const html = await this.fetch(supplier.earningsUrl);
        if (!html) continue;

        const $ = cheerio.load(html);
        const items = $("article, .press-release, .earnings-report, .news-item").toArray();

        for (const item of items.slice(0, 5)) {
          const $item = $(item);
          const title = $item.find("h2, h3, .title").first().text().trim();
          const link = $item.find("a").attr("href");
          const dateText = $item.find("time, .date, .published").first().text().trim();

          if (!title || !link) continue;

          // Check if this mentions the customer
          const fullText = $item.text().toLowerCase();
          if (!fullText.includes(customerName.toLowerCase())) {
            continue;
          }

          const publishedAt = this.parseDate(dateText);
          const quarter = this.extractQuarter(title);
          const year = publishedAt.getFullYear();

          const customerMentions = this.extractCustomerMentions($, $item, supplier.customers);

          earnings.push({
            url: link.startsWith("http") ? link : new URL(link, supplier.earningsUrl).href,
            supplier: supplier.name,
            quarter,
            year,
            publishedAt,
            customerMentions,
            revenueGuidance: this.extractGuidance($item),
            capacityNotes: this.extractCapacity($item),
          });
        }

        logger.info("Scraped supplier earnings", {
          supplier: supplier.name,
          customer: customerName,
          count: earnings.length,
        });
      } catch (error) {
        logger.error("Failed to scrape supplier earnings", {
          supplier: supplier.name,
          customer: customerName,
          error: String(error),
        });
      }
    }

    return earnings.length > 0 ? earnings : null;
  }

  private parseDate(text: string): Date {
    const date = new Date(text);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  private extractQuarter(text: string): string {
    const match = text.match(/Q[1-4]|first|second|third|fourth/i);
    return match ? match[0].toUpperCase() : "Q?";
  }

  private extractCustomerMentions(
    $: cheerio.CheerioAPI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $item: cheerio.Cheerio<any>,
    customers: string[]
  ): SupplierEarning["customerMentions"] {
    const mentions: SupplierEarning["customerMentions"] = [];
    const text = $item.text().toLowerCase();

    for (const customer of customers) {
      if (text.includes(customer.toLowerCase())) {
        const context = this.extractContext($item.text(), customer, 100);
        const sentiment = this.inferSentiment(context);
        mentions.push({ customer, context, sentiment });
      }
    }

    return mentions;
  }

  private extractContext(text: string, keyword: string, radius: number): string {
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index === -1) return "";
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + keyword.length + radius);
    return text.slice(start, end).trim();
  }

  private inferSentiment(context: string): "positive" | "negative" | "neutral" {
    const lower = context.toLowerCase();
    const positiveWords = ["growth", "increase", "strong", "demand", "expansion", "record"];
    const negativeWords = ["decline", "decrease", "weak", "slowdown", "reduction", "challenge"];

    const posCount = positiveWords.filter((w) => lower.includes(w)).length;
    const negCount = negativeWords.filter((w) => lower.includes(w)).length;

    if (posCount > negCount) return "positive";
    if (negCount > posCount) return "negative";
    return "neutral";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractGuidance($item: cheerio.Cheerio<any>): string | undefined {
    const text = $item.text().toLowerCase();
    const guidanceMatch = text.match(/guidance[:\s]+([^\.]+)/i);
    return guidanceMatch ? guidanceMatch[1].trim() : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractCapacity($item: cheerio.Cheerio<any>): string | undefined {
    const text = $item.text().toLowerCase();
    const capacityMatch = text.match(/capacity[:\s]+([^\.]+)/i);
    return capacityMatch ? capacityMatch[1].trim() : undefined;
  }
}
