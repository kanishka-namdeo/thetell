/**
 * Earnings call transcript scraper.
 *
 * Handles structured transcript formats from:
 * - SEC EDGAR 8-K filings (items that include transcripts)
 * - Company IR pages that publish transcripts
 * - Public government documents (FedSpeak, FOMC transcripts)
 *
 * Parses speaker identification, Q&A sections, and separates
 * prepared remarks from Q&A. Returns data compatible with Signal creation.
 *
 * Known limitations:
 * - PDF-only transcripts require external PDF-to-text conversion (not implemented)
 * - JS-rendered paywalled transcript pages (e.g., Seeking Alpha) cannot be scraped
 * - Speaker role detection is heuristic-based and may misclassify
 * - Format detection relies on common patterns; unusual layouts may fail
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface TranscriptSpeaker {
  name: string;
  role: string;
  company: string;
}

export interface TranscriptSection {
  type: "prepared_remarks" | "qa" | "other";
  speaker: TranscriptSpeaker | null;
  text: string;
}

export interface TranscriptData {
  url: string;
  title: string;
  companyName: string;
  publishedAt: Date | null;
  speakers: TranscriptSpeaker[];
  sections: TranscriptSection[];
  preparedRemarks: string;
  qaSection: string;
  fullText: string;
  metadata: Record<string, string>;
}

interface SpeakerMatch {
  name: string;
  role: string;
}

const EXECUTIVE_TITLES = [
  "CEO", "Chief Executive Officer",
  "CFO", "Chief Financial Officer",
  "COO", "Chief Operating Officer",
  "CTO", "Chief Technology Officer",
  "CIO", "Chief Information Officer",
  "CLO", "Chief Legal Officer",
  "General Counsel",
  "President",
  "Chairman",
  "Vice Chairman",
  "VP", "Vice President",
  "SVP", "Senior Vice President",
  "EVP", "Executive Vice President",
  "Director",
  "Head of",
  "Managing Director",
  "Chief Accounting Officer",
  "Investor Relations",
  "IR",
];

const ANALYST_INDICATORS = [
  "Analyst",
  "Portfolio Manager",
  "Managing Director",
  "Research",
];

export class TranscriptScraper extends BaseScraper {
  /**
   * Scrape an earnings call transcript from a URL.
   * Returns TranscriptData or null if scraping failed.
   */
  async scrapeTranscript(url: string): Promise<TranscriptData | null> {
    const normalizedUrl = this.normalizeUrl(url);
    const html = await this.fetch(normalizedUrl);

    if (html === null) {
      return null;
    }

    try {
      const $ = cheerio.load(html);
      const sourceType = this.detectSourceType($, normalizedUrl);

      let transcriptData: TranscriptData | null = null;

      switch (sourceType) {
        case "sec_edgar":
          transcriptData = this.parseSECFiling($, normalizedUrl);
          break;
        case "fed_speak":
          transcriptData = this.parseFedTranscript($, normalizedUrl);
          break;
        default:
          transcriptData = this.parseGenericTranscript($, normalizedUrl);
      }

      if (transcriptData) {
        logger.info("Scraped transcript", {
          url: normalizedUrl,
          title: transcriptData.title.slice(0, 60),
          sourceType,
          speakerCount: transcriptData.speakers.length,
          sectionCount: transcriptData.sections.length,
        });
      }

      return transcriptData;
    } catch (error) {
      logger.error("Failed to parse transcript", { url: normalizedUrl, error: String(error) });
      return null;
    }
  }

  /**
   * Adapter for the signals route — returns data in the same shape as other scrapers.
   */
  async scrapeArticle(url: string): Promise<{ title: string; bodyText: string; publishedAt: Date | null } | null> {
    const transcript = await this.scrapeTranscript(url);
    if (!transcript) return null;

    return {
      title: transcript.title,
      bodyText: transcript.fullText,
      publishedAt: transcript.publishedAt,
    };
  }

  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  }

  private detectSourceType(
    $: cheerio.CheerioAPI,
    url: string,
  ): "sec_edgar" | "fed_speak" | "generic" {
    if (url.includes("sec.gov") || url.includes("edgar")) {
      return "sec_edgar";
    }
    if (url.includes("federalreserve.gov") || url.includes("fomc") || url.includes("fed.gov")) {
      return "fed_speak";
    }

    const metaGenerator = $('meta[name="generator"]').attr("content") || "";
    if (metaGenerator.toLowerCase().includes("edgar")) return "sec_edgar";

    return "generic";
  }

  // ─── SEC EDGAR parsing ─────────────────────────────────────────────

  private parseSECFiling($: cheerio.CheerioAPI, url: string): TranscriptData | null {
    const title = this.extractTitle($);
    if (!title) return null;

    const bodyText = this.extractSECBody($);
    if (bodyText.length < 200) return null;

    const speakers = this.extractSpeakers(bodyText);
    const sections = this.buildSections(bodyText, speakers);
    const publishedAt = this.extractDate($);
    const companyName = this.extractCompanyName($, title);

    const { preparedRemarks, qaSection } = this.splitSections(sections);

    return {
      url,
      title,
      companyName,
      publishedAt,
      speakers,
      sections,
      preparedRemarks,
      qaSection,
      fullText: bodyText,
      metadata: { source: "sec_edgar" },
    };
  }

  private extractSECBody($: cheerio.CheerioAPI): string {
    $("script, style, nav, header, footer, aside, iframe").remove();

    const selectors = [
      "#form-content",
      ".filing-content",
      '[class*="filing"]',
      "#main-content",
      "article",
      ".article-body",
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = el
          .find("p, div")
          .map((_, node) => $(node).text().trim())
          .get()
          .filter((t) => t.length > 0)
          .join("\n\n");

        if (text.length > 200) {
          return this.cleanText(text);
        }
      }
    }

    const paragraphs = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(paragraphs);
  }

  // ─── Federal Reserve / FOMC parsing ────────────────────────────────

  private parseFedTranscript($: cheerio.CheerioAPI, url: string): TranscriptData | null {
    const title = this.extractTitle($);
    if (!title) return null;

    $("script, style, nav, header, footer, aside, iframe").remove();

    const content = $("article, .article, #content, .content, main").first();
    const bodyText = content.length
      ? content
          .find("p")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 0)
          .join("\n\n")
      : $("p")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 0)
          .join("\n\n");

    if (bodyText.length < 200) return null;

    const cleaned = this.cleanText(bodyText);
    const speakers = this.extractSpeakers(cleaned);
    const sections = this.buildSections(cleaned, speakers);
    const publishedAt = this.extractDate($);
    const { preparedRemarks, qaSection } = this.splitSections(sections);

    return {
      url,
      title,
      companyName: "Federal Reserve",
      publishedAt,
      speakers,
      sections,
      preparedRemarks,
      qaSection,
      fullText: cleaned,
      metadata: { source: "federal_reserve" },
    };
  }

  // ─── Generic transcript parsing (company IR pages, etc.) ───────────

  private parseGenericTranscript($: cheerio.CheerioAPI, url: string): TranscriptData | null {
    const title = this.extractTitle($);
    if (!title) return null;

    $("script, style, nav, header, footer, aside, iframe, .sidebar, .comments").remove();

    const bodyText = this.extractGenericBody($);
    if (bodyText.length < 200) return null;

    const speakers = this.extractSpeakers(bodyText);
    const sections = this.buildSections(bodyText, speakers);
    const publishedAt = this.extractDate($);
    const companyName = this.extractCompanyName($, title);
    const { preparedRemarks, qaSection } = this.splitSections(sections);

    return {
      url,
      title,
      companyName,
      publishedAt,
      speakers,
      sections,
      preparedRemarks,
      qaSection,
      fullText: bodyText,
      metadata: { source: "generic" },
    };
  }

  private extractGenericBody($: cheerio.CheerioAPI): string {
    const selectors = [
      '[itemprop="articleBody"]',
      ".transcript-content, .earnings-call-content, .transcript-body",
      '[class*="transcript"], [class*="call-content"]',
      ".entry-content, .post-content, .article-body, .story-body",
      '[class*="article-body"], [class*="post-content"]',
      "article",
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = el
          .find("p")
          .map((_, node) => $(node).text().trim())
          .get()
          .filter((t) => t.length > 0)
          .join("\n\n");

        if (text.length > 200) {
          return this.cleanText(text);
        }
      }
    }

    const paragraphs = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(paragraphs);
  }

  // ─── Speaker extraction ────────────────────────────────────────────

  /**
   * Extract speakers from transcript text using heuristic patterns.
   *
   * Common formats:
   * - "John Smith (CEO, Company): Text..."
   * - "John Smith, Chief Executive Officer: Text..."
   * - ">> John Smith: Text..."
   * - "JOHN SMITH: Text..."
   * - "Mr. Smith: Text..."
   */
  private extractSpeakers(text: string): TranscriptSpeaker[] {
    const speakerMap = new Map<string, TranscriptSpeaker>();

    const patterns: RegExp[] = [
      // "Name (Title, Company):" or "Name (Title):"
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*\(([^)]+)\)\s*:/m,
      // "Name, Title:" at start of line
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}),\s+((?:CEO|CFO|COO|CTO|CIO|CLO|President|Chairman|Director|VP|SVP|EVP|Head of|Managing Director|Chief|General Counsel|Investor Relations)[^:]*?)\s*:/m,
      // ">> Name:" format
      /^>>\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?:\s*\(([^)]*)\))?\s*:/m,
      // "Mr./Ms. LastName:" format
      /^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s*:/m,
    ];

    const lines = text.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 5 || trimmed.length > 200) continue;

      for (const pattern of patterns) {
        const match = pattern.exec(trimmed);
        if (!match) continue;

        const speakerMatch = this.resolveSpeaker(match, pattern);
        if (!speakerMatch) continue;

        const key = speakerMatch.name.toLowerCase();
        if (!speakerMap.has(key)) {
          speakerMap.set(key, {
            name: speakerMatch.name,
            role: speakerMatch.role,
            company: "",
          });
        }
        break;
      }
    }

    return Array.from(speakerMap.values());
  }

  private resolveSpeaker(match: RegExpMatchArray, pattern: RegExp): SpeakerMatch | null {
    // Pattern 1: "Name (Title, Company):"
    if (pattern.source.includes("\\(([^)]+)\\)")) {
      const name = match[1]?.trim();
      const roleInfo = match[2]?.trim() || "";

      if (!name) return null;

      const role = this.classifyRole(roleInfo);
      return { name, role };
    }

    // Pattern 2: "Name, Title:"
    if (pattern.source.includes(",\\s+(")) {
      const name = match[1]?.trim();
      const role = match[2]?.trim() || "";

      if (!name) return null;
      return { name, role: this.classifyRole(role) };
    }

    // Pattern 3: ">> Name:" with optional parenthetical
    if (pattern.source.includes(">>")) {
      const name = match[1]?.trim();
      const roleInfo = match[2]?.trim() || "";

      if (!name) return null;
      return { name, role: roleInfo ? this.classifyRole(roleInfo) : "Unknown" };
    }

    // Pattern 4: "Mr./Ms. LastName:"
    if (pattern.source.includes("Mr\\.")) {
      const title = match[1];
      const lastName = match[2];

      if (!title || !lastName) return null;
      return { name: `${title} ${lastName}`, role: "Executive" };
    }

    return null;
  }

  private classifyRole(text: string): string {
    if (!text) return "Unknown";

    const upper = text.toUpperCase();

    for (const indicator of ANALYST_INDICATORS) {
      if (upper.includes(indicator.toUpperCase())) {
        return "Analyst";
      }
    }

    for (const title of EXECUTIVE_TITLES) {
      if (upper.includes(title.toUpperCase())) {
        return "Executive";
      }
    }

    if (upper.includes("MODERATOR") || upper.includes("OPERATOR")) {
      return "Moderator";
    }

    return "Participant";
  }

  // ─── Section building ──────────────────────────────────────────────

  /**
   * Build transcript sections by identifying section boundaries and speaker turns.
   */
  private buildSections(text: string, speakers: TranscriptSpeaker[]): TranscriptSection[] {
    const sections: TranscriptSection[] = [];
    const speakerNames = new Set(speakers.map((s) => s.name.toLowerCase()));

    const qaMarkers = [
      /\bQ(?:uestion)?(?:\s*and)?\s*A(?:nswer)?\b/i,
      /\bQ&A\b/,
      /\bQuestions?\s+(?:and|&)\s+Answers?\b/i,
      /\bDiscussion\s+(?:Period|Session)\b/i,
      /[-=]{3,}\s*Q(?:uestion)?(?:\s*&\s*|\s+and\s+)A(?:nswer)?/i,
    ];

    const preparedMarkers = [
      /\b[Pp]repared\s+[Rr]emarks?\b/,
      /\bOpening\s+[Rr]emarks?\b/,
      /\b[Pp]resentation\b/,
      /[-=]{3,}\s*[Pp]repared/,
    ];

    let currentType: TranscriptSection["type"] = "prepared_remarks";
    let currentSpeaker: TranscriptSpeaker | null = null;
    let currentText = "";

    const lines = text.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for section boundaries
      const isQABoundary = qaMarkers.some((m) => m.test(trimmed));
      const isPreparedBoundary = preparedMarkers.some((m) => m.test(trimmed));

      if (isQABoundary) {
        if (currentText.trim()) {
          sections.push({ type: currentType, speaker: currentSpeaker, text: currentText.trim() });
        }
        currentType = "qa";
        currentSpeaker = null;
        currentText = "";
        continue;
      }

      if (isPreparedBoundary) {
        if (currentText.trim()) {
          sections.push({ type: currentType, speaker: currentSpeaker, text: currentText.trim() });
        }
        currentType = "prepared_remarks";
        currentSpeaker = null;
        currentText = "";
        continue;
      }

      // Check for speaker change
      const speakerLine = this.detectSpeakerLine(trimmed, speakerNames);
      if (speakerLine) {
        if (currentText.trim()) {
          sections.push({ type: currentType, speaker: currentSpeaker, text: currentText.trim() });
        }
        currentSpeaker = speakerLine;
        currentText = trimmed;
      } else {
        currentText += (currentText ? "\n" : "") + trimmed;
      }
    }

    if (currentText.trim()) {
      sections.push({ type: currentType, speaker: currentSpeaker, text: currentText.trim() });
    }

    return sections;
  }

  private detectSpeakerLine(
    line: string,
    knownSpeakers: Set<string>,
  ): TranscriptSpeaker | null {
    const patterns = [
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*(?:\([^)]*\))?\s*:/,
      /^>>\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/,
      /^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (!match) continue;

      let name: string;
      if (pattern.source.includes("Mr\\.")) {
        name = `${match[1]} ${match[2]}`;
      } else {
        name = match[1];
      }

      if (knownSpeakers.has(name.toLowerCase())) {
        const speaker = { name, role: "Unknown", company: "" };
        return speaker;
      }

      return { name, role: "Unknown", company: "" };
    }

    return null;
  }

  private splitSections(sections: TranscriptSection[]): {
    preparedRemarks: string;
    qaSection: string;
  } {
    const preparedParts: string[] = [];
    const qaParts: string[] = [];

    for (const section of sections) {
      if (section.type === "prepared_remarks") {
        preparedParts.push(section.text);
      } else if (section.type === "qa") {
        qaParts.push(section.text);
      }
    }

    return {
      preparedRemarks: preparedParts.join("\n\n"),
      qaSection: qaParts.join("\n\n"),
    };
  }

  // ─── Shared extraction helpers ─────────────────────────────────────

  private extractTitle($: cheerio.CheerioAPI): string {
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) return ogTitle.trim();

    const headline = $('[itemprop="headline"]').first().text().trim();
    if (headline) return headline;

    const h1 = $("h1").first().text().trim();
    if (h1) return h1;

    const title = $("title").first().text().trim();
    if (title) return title;

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
      dateStr = $("time").first().attr("datetime") || $("time").first().attr("content");
    }

    if (dateStr) {
      const date = new Date(dateStr.trim());
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }

  private extractCompanyName($: cheerio.CheerioAPI, title: string): string {
    const ogSite = $('meta[property="og:site_name"]').attr("content");
    if (ogSite) return ogSite.trim();

    const schemaOrg = $('[itemprop="publisher"]').first().text().trim();
    if (schemaOrg) return schemaOrg;

    // Try to extract from title: "Company Name - Q1 2024 Earnings Call Transcript"
    const titleMatch = /^(.+?)\s*[-–—]\s*(?:Q\d|Earnings|Call|Transcript)/i.exec(title);
    if (titleMatch) return titleMatch[1].trim();

    return "";
  }

  private cleanText(text: string): string {
    text = text.replace(/\n{3,}/g, "\n\n");
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.join("\n");
  }
}
