/**
 * Conference agenda scraper for tracking company presence at industry events.
 * Monitors tech conference schedules (CES, WWDC, Google I/O, etc.) for
 * speaking sessions, panels, booth presence, and announcements.
 *
 * Signal value: strategic focus areas, product reveals, partnerships,
 * executive messaging, industry positioning shifts.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import { normalizeUrl, computeContentHash } from "./url-normalizer";

export interface ConferenceSignal {
  id: string;
  type: "speaking" | "panel" | "booth" | "sponsor" | "announcement";
  conferenceName: string;
  company: string;
  url: string;
  title: string;
  description: string;
  publishedAt: Date;
  metadata: Record<string, string | number | boolean>;
  contentHash: string;
}

interface ConferenceConfig {
  name: string;
  url: string;
  scheduleUrl?: string;
}

export class ConferenceScraper extends BaseScraper {
  private readonly CONFERENCES: ConferenceConfig[] = [
    { name: "CES", url: "https://www.ces.tech/", scheduleUrl: "https://www.ces.tech/agenda/" },
    { name: "WWDC", url: "https://developer.apple.com/wwdc/", scheduleUrl: "https://developer.apple.com/wwdc25/sessions/" },
    { name: "Google I/O", url: "https://io.google/", scheduleUrl: "https://io.google/schedule/" },
    { name: "Microsoft Build", url: "https://build.microsoft.com/", scheduleUrl: "https://build.microsoft.com/schedule" },
    { name: "AWS re:Invent", url: "https://reinvent.awsevents.com/", scheduleUrl: "https://reinvent.awsevents.com/agenda/" },
    { name: "Dreamforce", url: "https://www.salesforce.com/dreamforce/", scheduleUrl: "https://www.salesforce.com/dreamforce/agenda/" },
    { name: "RSA Conference", url: "https://www.rsaconference.com/", scheduleUrl: "https://www.rsaconference.com/agenda" },
    { name: "Hot Chips", url: "https://hotchips.org/", scheduleUrl: "https://hotchips.org/program/" },
    { name: "NVIDIA GTC", url: "https://www.nvidia.com/gtc/", scheduleUrl: "https://www.nvidia.com/gtc/agenda/" },
    { name: "OCP Summit", url: "https://www.opencompute.org/summit", scheduleUrl: "https://www.opencompute.org/summit/agenda" },
  ];

  constructor() {
    super(1.0, 30000, 3, 86400, true); // 24h cache, skip robots
  }

  override get scraperName(): string {
    return "conference-scraper";
  }

  async scrape(companyName: string): Promise<ConferenceSignal[]> {
    logger.info("Starting conference scrape", { companyName });

    const signals: ConferenceSignal[] = [];

    try {
      for (const conference of this.CONFERENCES) {
        const url = conference.scheduleUrl || conference.url;

        try {
          const html = await this.fetch(url);
          if (!html) continue;

          const $ = cheerio.load(html);
          const sessions = this.extractSessions($, conference, companyName);
          signals.push(...sessions);
        } catch (error) {
          logger.warn("Failed to scrape conference", {
            conference: conference.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("Conference scrape completed", {
        companyName,
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("Conference scrape failed", {
        companyName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  private extractSessions(
    $: cheerio.CheerioAPI,
    conference: ConferenceConfig,
    companyName: string
  ): ConferenceSignal[] {
    const signals: ConferenceSignal[] = [];
    const selectors = [
      "article",
      ".session",
      ".agenda-item",
      ".talk",
      ".event",
      ".session-card",
      "[data-session]",
      ".schedule-item",
    ];

    const sessionElements = selectors
      .flatMap((sel) => $(sel).toArray())
      .filter((el, idx, arr) => arr.indexOf(el) === idx);

    for (const session of sessionElements.slice(0, 30)) {
      const $session = $(session);
      const title = $session
        .find("h1, h2, h3, h4, .title, .session-title, .talk-title")
        .first()
        .text()
        .trim();
      const description = $session
        .find("p, .description, .abstract, .summary, .talk-abstract")
        .first()
        .text()
        .trim();
      const link = $session.find("a").attr("href");
      const dateText = $session.find("time, .date, .datetime, .session-time").first().text().trim();
      const speakerText = $session
        .find(".speaker, .presenter, .speaker-name, .session-speaker")
        .first()
        .text()
        .trim();

      if (!title) continue;

      const fullText = `${title} ${description} ${speakerText}`.toLowerCase();
      if (!fullText.includes(companyName.toLowerCase())) continue;

      const appearanceType = this.classifyAppearance(fullText);
      const resolvedUrl = link
        ? link.startsWith("http")
          ? link
          : new URL(link, conference.url).href
        : conference.url;

      const normalizedUrl = normalizeUrl(resolvedUrl);
      const content = JSON.stringify({
        conference: conference.name,
        title,
        companyName,
      });

      signals.push({
        id: `conf-${conference.name.toLowerCase()}-${Buffer.from(title).toString("base64").slice(0, 12)}`,
        type: appearanceType,
        conferenceName: conference.name,
        company: companyName,
        url: resolvedUrl,
        title: `[${conference.name}] ${title}`,
        description: description.slice(0, 500),
        publishedAt: this.parseDate(dateText),
        metadata: {
          conference: conference.name,
          appearanceType,
          speaker: speakerText || "unknown",
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    }

    return signals;
  }

  private classifyAppearance(text: string): ConferenceSignal["type"] {
    if (text.includes("keynote") || text.includes("announcement") || text.includes("reveal")) {
      return "announcement";
    }
    if (text.includes("panel") || text.includes("discussion") || text.includes("roundtable")) {
      return "panel";
    }
    if (text.includes("booth") || text.includes("demo") || text.includes("exhibit")) {
      return "booth";
    }
    if (text.includes("sponsor") || text.includes("partner")) {
      return "sponsor";
    }
    return "speaking";
  }

  private parseDate(text: string): Date {
    const date = new Date(text);
    return isNaN(date.getTime()) ? new Date() : date;
  }
}
