/**
 * Stealth browser scraper using CloakBrowser
 * Handles sites that block HTTP requests or require JavaScript rendering
 */

import * as cheerio from "cheerio";
import { launch } from "cloakbrowser";
import { BaseScraper } from "./base-scraper";
import type { ArticleData } from "./news-scraper";
import { logger } from "@/lib/logger";

export class StealthBrowserScraper extends BaseScraper {
  private enabled: boolean;

  constructor() {
    // Slower rate limit (1 req/10s) - browser scraping is expensive
    super(0.1, 60000, 2, 86400, true);
    this.enabled = process.env.STEALTH_SCRAPER_ENABLED !== "false";
  }

  override get scraperName(): string {
    return "stealth-browser";
  }

  /**
   * Check if stealth scraper is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Override fetch() to use headless browser instead of HTTP
   */
  override async fetch(url: string): Promise<string | null> {
    if (!this.enabled) {
      logger.warn("Stealth scraper is disabled via STEALTH_SCRAPER_ENABLED");
      return null;
    }

    // Check cache first (inherited from BaseScraper)
    const cached = await this.cache.get(url);
    if (cached !== null) {
      logger.debug("Stealth scraper cache hit", { url });
      return cached as string;
    }

    let browser;
    let context;
    let page;
    try {
      // Launch CloakBrowser with humanize mode for stealth
      browser = await launch({
        headless: true,
        humanize: true,
      });

      context = await browser.newContext();
      page = await context.newPage();

      // Navigate to URL
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: this.timeout,
      });

      // Wait a bit for any dynamic content
      await page.waitForTimeout(2000);

      // Extract fully rendered HTML
      const html = await page.content();
      if (html.length > 10 * 1024 * 1024) {
        throw new Error("HTML exceeds 10MB limit");
      }

      // Cache the result
      await this.cache.set(url, html);

      logger.info("Stealth browser scraped successfully", {
        url,
        htmlLength: html.length,
      });

      return html;
    } catch (error) {
      logger.error("Stealth browser scraping failed", {
        url,
        error: String(error),
      });
      return null;
    } finally {
      // Clean up in reverse order: page -> context -> browser
      // Each cleanup is wrapped in try-catch to ensure all resources are released
      if (page) {
        try {
          await page.close();
        } catch (e) {
          logger.debug("Failed to close page", { error: String(e) });
        }
      }
      if (context) {
        try {
          await context.close();
        } catch (e) {
          logger.debug("Failed to close context", { error: String(e) });
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.debug("Failed to close browser", { error: String(e) });
        }
      }
    }
  }

  /**
   * Scrape article using stealth browser
   * Follows same pattern as BlogScraper.scrapeArticle()
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

      logger.info("Stealth browser scraped article", {
        url: normalizedUrl,
        title: article.title.slice(0, 60),
        bodyLength: article.bodyText.length,
      });

      return article;
    } catch (error) {
      logger.error("Failed to parse stealth browser content", {
        url: normalizedUrl,
        error: String(error),
      });
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
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) return ogTitle.trim();

    const headline = $('[itemprop="headline"]').first().text().trim();
    if (headline) return headline;

    const entryTitle = $(".entry-title, .post-title").first().text().trim();
    if (entryTitle) return entryTitle;

    const h1 = $("h1").first().text().trim();
    if (h1) return h1;

    const title = $("title").first().text().trim();
    if (title) return title;

    return "";
  }

  private extractAuthor($: cheerio.CheerioAPI): string {
    const ogAuthor = $('meta[property="article:author"]').attr("content");
    if (ogAuthor) return ogAuthor.trim();

    const authorTag = $('[itemprop="author"]').first();
    if (authorTag.length) {
      const name = authorTag.find('[itemprop="name"]').first().text().trim();
      if (name) return name;
      const text = authorTag.text().trim();
      if (text) return text;
    }

    const wpAuthor =
      $(".entry-author .author-name, .post-author, .byline a, .author-name")
        .first()
        .text()
        .trim();
    if (wpAuthor) return wpAuthor;

    const metaAuthor = $('meta[name="author"]').attr("content");
    if (metaAuthor) return metaAuthor.trim();

    return "";
  }

  private extractDate($: cheerio.CheerioAPI): Date | null {
    let dateStr: string | undefined;

    dateStr = $('meta[property="article:published_time"]').attr("content");

    if (!dateStr) {
      dateStr =
        $('[itemprop="datePublished"]').attr("content") ||
        $('[itemprop="datePublished"]').attr("datetime");
    }

    if (!dateStr) {
      dateStr =
        $(".entry-date, .post-date, time.published").first().attr("datetime") ||
        $(".entry-date, .post-date, time.published").first().attr("content");
    }

    if (!dateStr) {
      dateStr =
        $("time").first().attr("datetime") || $("time").first().attr("content");
    }

    if (dateStr) {
      return this.parseDate(dateStr.trim());
    }

    return null;
  }

  private parseDate(dateStr: string): Date | null {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/,
      /^(\w+ \d{1,2}, \d{4})$/,
      /^(\d{1,2} \w+ \d{4})$/,
    ];

    for (const format of formats) {
      if (format.test(dateStr)) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }

    logger.debug("Could not parse date", { dateStr });
    return null;
  }

  private extractBody($: cheerio.CheerioAPI): string {
    $(
      "script, style, nav, header, footer, aside, iframe, .comments, .sidebar, noscript"
    ).remove();

    const selectors = [
      '[itemprop="articleBody"]',
      ".entry-content, .post-content, .single-post-content",
      ".post-content, .post-full-content",
      ".press-release-content, .press-release-body, .ir-content",
      ".field--name-body, .node__content, .content-wrapper",
      'main [role="main"]',
      '[class*="article-body"], [class*="post-body"], [class*="blog-content"]',
      '[class*="entry-content"], [class*="story-body"]',
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

    const article = $("article").first();
    if (article.length) {
      article
        .find("nav, aside, footer, figure, img, video, .comments, .sidebar")
        .remove();
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

    const main = $("main").first();
    if (main.length) {
      main
        .find(
          "nav, aside, footer, figure, img, video, .comments, .sidebar, script, style"
        )
        .remove();
      const text = main
        .find("p")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 0)
        .join("\n\n");

      if (text.length > 100) {
        return this.cleanText(text);
      }
    }

    const paragraphs = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(paragraphs);
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    const ogDesc = $('meta[property="og:description"]').attr("content");
    if (ogDesc) return ogDesc.trim();

    const metaDesc = $('meta[name="description"]').attr("content");
    if (metaDesc) return metaDesc.trim();

    return "";
  }

  private extractMetadata($: cheerio.CheerioAPI): Record<string, string> {
    const metadata: Record<string, string> = {};

    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr("property");
      const content = $(el).attr("content");
      if (prop && content) {
        metadata[prop] = content;
      }
    });

    const siteName = $('meta[property="og:site_name"]').attr("content");
    if (siteName) {
      metadata["siteName"] = siteName.trim();
    }

    const categories = $('[rel="category"]')
      .map((_, el) => $(el).text().trim())
      .get();
    if (categories.length > 0) {
      metadata["blog:categories"] = categories.join(", ");
    }

    const tags = $('[rel="tag"]')
      .map((_, el) => $(el).text().trim())
      .get();
    if (tags.length > 0) {
      metadata["blog:tags"] = tags.join(", ");
    }

    return metadata;
  }

  private cleanText(text: string): string {
    text = text.replace(/\n{3,}/g, "\n\n");
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.join("\n");
  }
}
