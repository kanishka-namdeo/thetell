/**
 * Jina Reader scraper - self-hosted service for JS-rendered pages
 * Converts URLs to clean markdown using headless Chrome
 * Falls back between fast HTTP scrapers and stealth browser
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import type { ArticleData } from "./news-scraper";

export class JinaReaderScraper extends BaseScraper {
  private readerUrl: string;
  private enabled: boolean;

  constructor() {
    // Moderate rate limit (1 req/5s) - Jina Reader uses headless Chrome
    super(0.2, 45000, 2, 86400, true);
    this.readerUrl = process.env.JINA_READER_URL || "http://localhost:8081";
    this.enabled = process.env.JINA_READER_ENABLED !== "false";
  }

  override get scraperName(): string {
    return "jina-reader";
  }

  /**
   * Check if Jina Reader is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Fetch URL via Jina Reader API
   * Returns clean markdown content
   */
  override async fetch(url: string): Promise<string | null> {
    if (!this.enabled) {
      logger.warn("Jina Reader is disabled via JINA_READER_ENABLED");
      return null;
    }

    // Check cache first
    const cached = await this.cache.get(url);
    if (cached !== null) {
      logger.debug("Jina Reader cache hit", { url });
      return cached;
    }

    try {
      // Jina Reader endpoint: GET /{url} returns markdown
      const jinaEndpoint = `${this.readerUrl}/${encodeURIComponent(url)}`;
      
      logger.debug("jina_reader.fetch", { url, endpoint: jinaEndpoint });

      const response = await fetch(jinaEndpoint, {
        headers: {
          "User-Agent": BaseScraper.USER_AGENT,
          Accept: "text/markdown",
        },
        signal: AbortSignal.timeout(this.timeout),
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`Jina Reader HTTP ${response.status}: ${response.statusText}`);
      }

      const markdown = await this.readBodyWithLimit(response);

      if (markdown.length < 100) {
        logger.warn("jina_reader.content_too_short", { url, length: markdown.length });
        return null;
      }

      // Cache the result
      await this.cache.set(url, markdown);

      logger.info("jina_reader.success", {
        url,
        markdownLength: markdown.length,
      });

      return markdown;
    } catch (error) {
      logger.error("jina_reader.failed", {
        url,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Scrape article using Jina Reader
   * Returns ArticleData with markdown content
   */
  async scrapeArticle(url: string): Promise<ArticleData | null> {
    const normalizedUrl = this.normalizeUrl(url);
    const markdown = await this.fetch(normalizedUrl);

    if (markdown === null) {
      return null;
    }

    try {
      // Extract title from markdown (first # heading or first line)
      const title = this.extractTitleFromMarkdown(markdown);
      
      // Extract body text (everything after title or full markdown)
      const bodyText = this.extractBodyFromMarkdown(markdown, title);

      const article: ArticleData = {
        url: normalizedUrl,
        title,
        author: "", // Jina Reader doesn't extract metadata
        publishedAt: null,
        bodyText,
        description: bodyText.slice(0, 200), // Use first 200 chars as description
        metadata: {
          source: "jina-reader",
          format: "markdown",
        },
      };

      logger.info("jina_reader.scraped_article", {
        url: normalizedUrl,
        title: article.title.slice(0, 60),
        bodyLength: article.bodyText.length,
      });

      return article;
    } catch (error) {
      logger.error("jina_reader.parse_failed", {
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

  /**
   * Extract title from markdown
   * Looks for first # heading or first non-empty line
   */
  private extractTitleFromMarkdown(markdown: string): string {
    const lines = markdown.split("\n");

    // Look for first # heading
    for (const line of lines) {
      const match = line.match(/^#\s+(.+)$/);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback: first non-empty line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith("```")) {
        return trimmed.slice(0, 200); // Limit title length
      }
    }

    return "";
  }

  /**
   * Extract body text from markdown
   * Removes title line and returns cleaned content
   */
  private extractBodyFromMarkdown(markdown: string, title: string): string {
    let body = markdown;

    // Remove title if found
    if (title) {
      const titlePattern = new RegExp(`^#\\s+${this.escapeRegex(title)}\\s*$`, "m");
      body = body.replace(titlePattern, "");
    }

    // Remove code blocks (not useful for analysis)
    body = body.replace(/```[\s\S]*?```/g, "");

    // Remove image links
    body = body.replace(/!\[.*?\]\(.*?\)/g, "");

    // Remove link URLs but keep text
    body = body.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Remove HTML tags
    body = body.replace(/<[^>]+>/g, "");

    // Clean up whitespace
    body = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n\n");

    return body;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
