/**
 * Executive appearance scraper for tracking public statements by company executives.
 * Monitors news sites, conference transcripts, and media appearances to detect
 * messaging shifts and strategic signals from leadership.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface ExecutiveAppearance {
  url: string;
  title: string;
  executive: string;
  company: string;
  event: string;
  publishedAt: Date;
  summary: string;
  keyQuotes: string[];
}

export class ExecutiveAppearanceScraper extends BaseScraper {
  constructor() {
    super(1.0, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "exec-appearance-scraper";
  }

  async scrapeAppearances(companyName: string): Promise<ExecutiveAppearance[] | null> {
    const appearances: ExecutiveAppearance[] = [];

    // Search for executive appearances in tech news
    const searchUrls = [
      `https://www.cnbc.com/quotes/${companyName.toUpperCase()}-news`,
      `https://techcrunch.com/tag/${companyName.toLowerCase().replace(/\s+/g, "-")}/`,
      `https://www.theverge.com/search?q=${encodeURIComponent(companyName)}`,
    ];

    for (const searchUrl of searchUrls) {
      try {
        const html = await this.fetch(searchUrl);
        if (!html) continue;

        const $ = cheerio.load(html);
        const articles = $("article, .article-card, .news-item, .card").toArray();

        for (const article of articles.slice(0, 10)) {
          const $article = $(article);
          const title = $article.find("h2, h3, .headline, .title").first().text().trim();
          const link = $article.find("a").attr("href");
          const summary = $article.find("p, .summary, .deck").first().text().trim();
          const dateText = $article.find("time, .date, .published").first().text().trim();

          if (!title || !link) continue;

          // Check if this mentions an executive
          const executive = this.extractExecutive(title + " " + summary, companyName);
          if (!executive) continue;

          const event = this.extractEvent(title);
          const publishedAt = this.parseDate(dateText);

          appearances.push({
            url: link.startsWith("http") ? link : new URL(link, searchUrl).href,
            title,
            executive,
            company: companyName,
            event,
            publishedAt,
            summary: summary.slice(0, 500),
            keyQuotes: this.extractQuotes(summary),
          });
        }
      } catch (error) {
        logger.error("Failed to scrape executive appearances", {
          source: searchUrl,
          company: companyName,
          error: String(error),
        });
      }
    }

    logger.info("Scraped executive appearances", {
      company: companyName,
      count: appearances.length,
    });

    return appearances.length > 0 ? appearances : null;
  }

  private extractExecutive(text: string, companyName: string): string | null {
    // Common executive titles
    const execTitles = ["CEO", "CTO", "CFO", "COO", "president", "founder", "chairman"];
    const lower = text.toLowerCase();

    for (const title of execTitles) {
      if (lower.includes(title)) {
        // Try to extract name before the title
        const match = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\s+(?:,?\s+)?(?:the\s+)?/i);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  }

  private extractEvent(text: string): string {
    const events = [
      "conference",
      "summit",
      "earnings call",
      "interview",
      "podcast",
      "keynote",
      "panel",
      "forum",
    ];

    const lower = text.toLowerCase();
    for (const event of events) {
      if (lower.includes(event)) {
        return event;
      }
    }

    return "public appearance";
  }

  private parseDate(text: string): Date {
    const date = new Date(text);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  private extractQuotes(text: string): string[] {
    const quotes: string[] = [];
    const quoteRegex = /"([^"]+)"/g;
    let match;

    while ((match = quoteRegex.exec(text)) !== null) {
      if (match[1].length > 20 && match[1].length < 200) {
        quotes.push(match[1]);
      }
    }

    return quotes.slice(0, 3);
  }
}
