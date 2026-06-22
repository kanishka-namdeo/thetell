/**
 * App Store change tracker for monitoring app ecosystem shifts.
 * Detects new app launches, category changes, and removals that signal
 * platform strategy and competitive dynamics.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface AppStoreChange {
  url: string;
  appName: string;
  developer: string;
  category: string;
  changeType: "new" | "updated" | "removed" | "featured";
  publishedAt: Date;
  description: string;
  rating?: number;
  price?: string;
}

export class AppStoreTracker extends BaseScraper {
  constructor() {
    super(1.0, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "appstore-tracker";
  }

  async scrapeChanges(companyName?: string): Promise<AppStoreChange[] | null> {
    const changes: AppStoreChange[] = [];

    // Monitor App Store top charts and featured apps
    const urls = [
      "https://www.apple.com/app-store/charts/",
      "https://apps.apple.com/us/charts/iphone/",
    ];

    for (const url of urls) {
      try {
        const html = await this.fetch(url);
        if (!html) continue;

        const $ = cheerio.load(html);
        const appCards = $(".chart-result, .app-card, .we-lockup__content").toArray();

        for (const card of appCards.slice(0, 20)) {
          const $card = $(card);
          const appName = $card.find(".app-name, h2, .title").first().text().trim();
          const developer = $card.find(".developer, .artist, .subtitle").first().text().trim();
          const category = $card.find(".category, .genre").first().text().trim();
          const link = $card.find("a").attr("href");
          const rating = parseFloat($card.find(".rating, .star-rating").text().trim()) || undefined;
          const price = $card.find(".price, .buy-button").text().trim();

          if (!appName || !link) continue;

          // Filter by company if specified
          if (companyName && !developer.toLowerCase().includes(companyName.toLowerCase())) {
            continue;
          }

          changes.push({
            url: link.startsWith("http") ? link : `https://apps.apple.com${link}`,
            appName,
            developer,
            category,
            changeType: "featured",
            publishedAt: new Date(),
            description: $card.find(".description, .summary").text().trim().slice(0, 300),
            rating,
            price: price || "Free",
          });
        }
      } catch (error) {
        logger.error("Failed to scrape App Store", {
          url,
          error: String(error),
        });
      }
    }

    logger.info("Scraped App Store changes", {
      company: companyName || "all",
      count: changes.length,
    });

    return changes.length > 0 ? changes : null;
  }
}
