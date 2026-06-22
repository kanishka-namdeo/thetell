/**
 * Conference agenda scraper for tracking company presence at industry events.
 * Monitors tech conference schedules, speaking slots, and booth presence
 * to identify strategic focus areas and industry positioning.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface ConferenceAppearance {
  url: string;
  conferenceName: string;
  conferenceDate: Date;
  company: string;
  appearanceType: "speaking" | "panel" | "booth" | "sponsor" | "attendee";
  title: string;
  description: string;
  executive?: string;
  location?: string;
}

export class ConferenceAgendaScraper extends BaseScraper {
  private readonly CONFERENCES = [
    { name: "CES", url: "https://www.ces.tech/agenda/" },
    { name: "MWC", url: "https://www.mwcbarcelona.com/agenda" },
    { name: "WWDC", url: "https://developer.apple.com/wwdc/" },
    { name: "Google I/O", url: "https://io.google/schedule/" },
    { name: "Microsoft Build", url: "https://build.microsoft.com/schedule" },
    { name: "AWS re:Invent", url: "https://reinvent.awsevents.com/agenda/" },
    { name: "Dreamforce", url: "https://www.salesforce.com/dreamforce/agenda/" },
    { name: "Strata", url: "https://strataconference.com/schedule/" },
    { name: "RSA Conference", url: "https://www.rsaconference.com/agenda" },
    { name: "Hot Chips", url: "https://hotchips.org/program/" },
  ];

  constructor() {
    super(1.0, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "conference-agenda-scraper";
  }

  async scrapeAgendas(companyName: string): Promise<ConferenceAppearance[] | null> {
    const appearances: ConferenceAppearance[] = [];

    for (const conference of this.CONFERENCES) {
      try {
        const html = await this.fetch(conference.url);
        if (!html) continue;

        const $ = cheerio.load(html);
        const sessions = $("article, .session, .agenda-item, .talk, .event").toArray();

        for (const session of sessions.slice(0, 20)) {
          const $session = $(session);
          const title = $session.find("h2, h3, .title, .session-title").first().text().trim();
          const description = $session.find("p, .description, .abstract, .summary").first().text().trim();
          const link = $session.find("a").attr("href");
          const dateText = $session.find("time, .date, .datetime").first().text().trim();
          const location = $session.find(".location, .room, .venue").first().text().trim();

          if (!title) continue;

          const fullText = (title + " " + description).toLowerCase();
          if (!fullText.includes(companyName.toLowerCase())) {
            continue;
          }

          const appearanceType = this.determineAppearanceType($session);
          const executive = this.extractExecutive($session);

          appearances.push({
            url: link ? (link.startsWith("http") ? link : new URL(link, conference.url).href) : conference.url,
            conferenceName: conference.name,
            conferenceDate: this.parseDate(dateText),
            company: companyName,
            appearanceType,
            title,
            description: description.slice(0, 500),
            executive: executive || undefined,
            location: location || undefined,
          });
        }
      } catch (error) {
        logger.error("Failed to scrape conference agenda", {
          conference: conference.name,
          company: companyName,
          error: String(error),
        });
      }
    }

    logger.info("Scraped conference agendas", {
      company: companyName,
      count: appearances.length,
    });

    return appearances.length > 0 ? appearances : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private determineAppearanceType($session: cheerio.Cheerio<any>): ConferenceAppearance["appearanceType"] {
    const text = $session.text().toLowerCase();

    if (text.includes("keynote") || text.includes("talk") || text.includes("presentation")) {
      return "speaking";
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

    return "attendee";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractExecutive($session: cheerio.Cheerio<any>): string | null {
    const speakerText = $session.find(".speaker, .presenter, .speaker-name").first().text().trim();
    if (speakerText) {
      return speakerText;
    }

    // Try to find name patterns in the session text
    const text = $session.text();
    const nameMatch = text.match(/(?:by|with|featuring|presented by)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/);
    return nameMatch ? nameMatch[1] : null;
  }

  private parseDate(text: string): Date {
    const date = new Date(text);
    return isNaN(date.getTime()) ? new Date() : date;
  }
}
