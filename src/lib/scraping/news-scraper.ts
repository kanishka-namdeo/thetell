/**
 * News article scraper with HTML parsing and metadata extraction.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface ArticleData {
  url: string;
  title: string;
  author: string;
  publishedAt: Date | null;
  bodyText: string;
  description: string;
  metadata: Record<string, string>;
}

export class NewsScraper extends BaseScraper {
  /**
   * Scrape and parse a news article from a URL.
   * Returns ArticleData or null if scraping failed.
   */
  async scrapeArticle(url: string): Promise<ArticleData | null> {
    const normalizedUrl = this.normalizeUrl(url);
    const html = await this.fetch(normalizedUrl);

    if (html === null) {
      return null;
    }

    try {
      const $ = cheerio.load(html);
      const article: ArticleData = {
        url: normalizedUrl,
        title: this.extractTitle($),
        author: this.extractAuthor($),
        publishedAt: this.extractDate($),
        bodyText: this.extractBody($),
        description: this.extractDescription($),
        metadata: this.extractMetadata($),
      };

      logger.info("Scraped article", {
        url: normalizedUrl,
        title: article.title.slice(0, 60),
        bodyLength: article.bodyText.length,
      });

      return article;
    } catch (error) {
      logger.error("Failed to parse article", { url: normalizedUrl, error: String(error) });
      return null;
    }
  }

  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  }

  private extractTitle($: cheerio.CheerioAPI): string {
    // OpenGraph title
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) {
      return ogTitle.trim();
    }

    // Schema.org headline
    const headline = $('[itemprop="headline"]').first().text().trim();
    if (headline) {
      return headline;
    }

    // <h1> tag
    const h1 = $("h1").first().text().trim();
    if (h1) {
      return h1;
    }

    // <title> tag
    const title = $("title").first().text().trim();
    if (title) {
      return title;
    }

    return "";
  }

  private extractAuthor($: cheerio.CheerioAPI): string {
    // OpenGraph author
    const ogAuthor = $('meta[property="article:author"]').attr("content");
    if (ogAuthor) {
      return ogAuthor.trim();
    }

    // Schema.org author
    const authorTag = $('[itemprop="author"]').first();
    if (authorTag.length) {
      const name = authorTag.find('[itemprop="name"]').first().text().trim();
      if (name) {
        return name;
      }
      const text = authorTag.text().trim();
      if (text) {
        return text;
      }
    }

    // Meta author
    const metaAuthor = $('meta[name="author"]').attr("content");
    if (metaAuthor) {
      return metaAuthor.trim();
    }

    return "";
  }

  private extractDate($: cheerio.CheerioAPI): Date | null {
    let dateStr: string | undefined;

    // OpenGraph
    dateStr = $('meta[property="article:published_time"]').attr("content");

    // Schema.org datePublished
    if (!dateStr) {
      dateStr =
        $('[itemprop="datePublished"]').attr("content") ||
        $('[itemprop="datePublished"]').attr("datetime");
    }

    // <time> tag
    if (!dateStr) {
      dateStr = $("time").first().attr("datetime") || $("time").first().attr("content");
    }

    if (dateStr) {
      return this.parseDate(dateStr.trim());
    }

    return null;
  }

  private parseDate(dateStr: string): Date | null {
    // Try ISO 8601 formats first
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try common formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\w+ \d{1,2}, \d{4})$/, // Month DD, YYYY
      /^(\d{1,2} \w+ \d{4})$/, // DD Month YYYY
    ];

    for (const format of formats) {
      if (format.test(dateStr)) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    logger.debug("Could not parse date", { dateStr });
    return null;
  }

  private extractBody($: cheerio.CheerioAPI): string {
    // Remove non-content elements
    $("script, style, nav, header, footer, aside, iframe").remove();

    // Try common article body selectors
    const selectors = [
      '[itemprop="articleBody"]',
      '[class*="article-body"], [class*="post-content"], [class*="entry-content"], [class*="story-body"]',
      '[class*="article__body"], [class*="content-body"]',
    ];

    for (const selector of selectors) {
      const body = $(selector).first();
      if (body.length) {
        const text = body
          .find("p")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 0)
          .join("\n\n");

        if (text.length > 100) {
          return this.cleanText(text);
        }
      }
    }

    // Fallback: use <article> tag
    const article = $("article").first();
    if (article.length) {
      article.find("nav, aside, footer, figure, img, video").remove();
      const text = article
        .find("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 0)
        .join("\n\n");

      if (text.length > 100) {
        return this.cleanText(text);
      }
    }

    // Last resort: all <p> tags
    const paragraphs = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(paragraphs);
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    // OpenGraph description
    const ogDesc = $('meta[property="og:description"]').attr("content");
    if (ogDesc) {
      return ogDesc.trim();
    }

    // Meta description
    const metaDesc = $('meta[name="description"]').attr("content");
    if (metaDesc) {
      return metaDesc.trim();
    }

    return "";
  }

  private extractMetadata($: cheerio.CheerioAPI): Record<string, string> {
    const metadata: Record<string, string> = {};

    // OpenGraph tags
    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr("property");
      const content = $(el).attr("content");
      if (prop && content) {
        metadata[prop] = content;
      }
    });

    return metadata;
  }

  private cleanText(text: string): string {
    // Collapse multiple blank lines
    text = text.replace(/\n{3,}/g, "\n\n");
    // Remove leading/trailing whitespace per line
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.join("\n");
  }
}
