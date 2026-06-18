/**
 * Blog post scraper supporting WordPress, Ghost, and custom blog layouts.
 * Uses the same extraction fallback pattern as NewsScraper.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import type { ArticleData } from "./news-scraper";

export class BlogScraper extends BaseScraper {
  /**
   * Scrape a blog post from a URL.
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

      logger.info("Scraped blog post", {
        url: normalizedUrl,
        title: article.title.slice(0, 60),
        bodyLength: article.bodyText.length,
      });

      return article;
    } catch (error) {
      logger.error("Failed to parse blog post", { url: normalizedUrl, error: String(error) });
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

    // WordPress-specific: .entry-title
    const entryTitle = $(".entry-title, .post-title").first().text().trim();
    if (entryTitle) return entryTitle;

    // Ghost-specific: .post-full-title
    const ghostTitle = $(".post-full-title, .post-title").first().text().trim();
    if (ghostTitle) return ghostTitle;

    const h1 = $("h1").first().text().trim();
    if (h1) return h1;

    const title = $("title").first().text().trim();
    if (title) return title;

    return "";
  }

  private extractAuthor($: cheerio.CheerioAPI): string {
    const ogAuthor = $('meta[property="article:author"]').attr("content");
    if (ogAuthor) return ogAuthor.trim();

    // Schema.org author
    const authorTag = $('[itemprop="author"]').first();
    if (authorTag.length) {
      const name = authorTag.find('[itemprop="name"]').first().text().trim();
      if (name) return name;
      const text = authorTag.text().trim();
      if (text) return text;
    }

    // WordPress-specific: .author, .by-author
    const wpAuthor = $(".entry-author .author-name, .post-author, .byline a, .author-name").first().text().trim();
    if (wpAuthor) return wpAuthor;

    // Ghost-specific
    const ghostAuthor = $(".post-full-author a, .author-name").first().text().trim();
    if (ghostAuthor) return ghostAuthor;

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

    // WordPress-specific
    if (!dateStr) {
      dateStr = $(".entry-date, .post-date, time.published").first().attr("datetime") ||
        $(".entry-date, .post-date, time.published").first().attr("content");
    }

    if (!dateStr) {
      dateStr = $("time").first().attr("datetime") || $("time").first().attr("content");
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

    logger.debug("Could not parse blog date", { dateStr });
    return null;
  }

  private extractBody($: cheerio.CheerioAPI): string {
    $("script, style, nav, header, footer, aside, iframe, .comments, .sidebar").remove();

    const selectors = [
      // Schema.org
      '[itemprop="articleBody"]',
      // WordPress
      ".entry-content, .post-content, .single-post-content",
      // Ghost
      ".post-content, .post-full-content",
      // Generic blog patterns
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

    // Fallback: <article> tag
    const article = $("article").first();
    if (article.length) {
      article.find("nav, aside, footer, figure, img, video, .comments, .sidebar").remove();
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

    // Blog-specific metadata
    const categories = $('[rel="category"]').map((_, el) => $(el).text().trim()).get();
    if (categories.length > 0) {
      metadata["blog:categories"] = categories.join(", ");
    }

    const tags = $('[rel="tag"]').map((_, el) => $(el).text().trim()).get();
    if (tags.length > 0) {
      metadata["blog:tags"] = tags.join(", ");
    }

    return metadata;
  }

  private cleanText(text: string): string {
    text = text.replace(/\n{3,}/g, "\n\n");
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.join("\n");
  }
}
