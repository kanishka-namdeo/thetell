/**
 * Job posting scraper for company career pages.
 * Handles common ATS platforms (Greenhouse, Lever, Workday) and custom career pages.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface JobPostingData {
  url: string;
  title: string;
  company: string;
  department: string;
  location: string;
  description: string;
  requirements: string[];
  postedAt: Date | null;
  metadata: Record<string, string>;
}

export class JobPostingScraper extends BaseScraper {
  /**
   * Scrape a job posting from a URL.
   * Returns JobPostingData or null if scraping failed.
   */
  async scrapeJob(url: string): Promise<JobPostingData | null> {
    const normalizedUrl = this.normalizeUrl(url);
    const html = await this.fetch(normalizedUrl);

    if (html === null) {
      return null;
    }

    try {
      const $ = cheerio.load(html);

      // Detect ATS platform
      const ats = this.detectATS($, normalizedUrl);

      let jobData: JobPostingData | null = null;

      switch (ats) {
        case "greenhouse":
          jobData = this.parseGreenhouse($, normalizedUrl);
          break;
        case "lever":
          jobData = this.parseLever($, normalizedUrl);
          break;
        case "workday":
          jobData = this.parseWorkday($, normalizedUrl);
          break;
        default:
          jobData = this.parseGenericJob($, normalizedUrl);
      }

      if (jobData) {
        logger.info("Scraped job posting", {
          url: normalizedUrl,
          title: jobData.title.slice(0, 60),
          ats,
        });
      }

      return jobData;
    } catch (error) {
      logger.error("Failed to parse job posting", { url: normalizedUrl, error: String(error) });
      return null;
    }
  }

  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  }

  /**
   * Detect which ATS platform is being used.
   */
  private detectATS($: cheerio.CheerioAPI, url: string): "greenhouse" | "lever" | "workday" | "generic" {
    // Check URL patterns
    if (url.includes("boards.greenhouse.io") || url.includes("greenhouse.io")) {
      return "greenhouse";
    }
    if (url.includes("jobs.lever.co") || url.includes("lever.co")) {
      return "lever";
    }
    if (url.includes("myworkdayjobs.com") || url.includes("myworkdaysite.com")) {
      return "workday";
    }

    // Check meta tags and scripts
    const metaGenerator = $('meta[name="generator"]').attr("content") || "";
    if (metaGenerator.toLowerCase().includes("greenhouse")) return "greenhouse";
    if (metaGenerator.toLowerCase().includes("lever")) return "lever";
    if (metaGenerator.toLowerCase().includes("workday")) return "workday";

    // Check for ATS-specific elements
    if ($(".greenhouse-job, [data-greenhouse]").length) return "greenhouse";
    if ($(".lever-job, [data-lever]").length) return "lever";

    return "generic";
  }

  /**
   * Parse Greenhouse job posting.
   */
  private parseGreenhouse($: cheerio.CheerioAPI, url: string): JobPostingData | null {
    const title = $("#app h1, .app h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() || "";

    if (!title) return null;

    const company = $('meta[property="og:site_name"]').attr("content")?.trim() || "";
    const location = $(".location, .office-location").first().text().trim() ||
      $('[data-location]').attr("data-location") || "";

    const description = this.extractGreenhouseDescription($);
    const requirements = this.extractRequirements($);

    const postedAt = this.extractDate($);

    return {
      url,
      title,
      company,
      department: "",
      location,
      description,
      requirements,
      postedAt,
      metadata: { ats: "greenhouse" },
    };
  }

  private extractGreenhouseDescription($: cheerio.CheerioAPI): string {
    const content = $("#content, .app #content").first();
    if (!content.length) return "";

    // Remove requirements section if present
    content.find(".requirements, #requirements").remove();

    const text = content
      .find("p, li")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(text);
  }

  /**
   * Parse Lever job posting.
   */
  private parseLever($: cheerio.CheerioAPI, url: string): JobPostingData | null {
    const title = $(".text-title-large, h2.post-title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() || "";

    if (!title) return null;

    const company = $(".text-title-size-small, .company-name").first().text().trim() ||
      $('meta[property="og:site_name"]').attr("content")?.trim() || "";

    const location = $(".text.location, .post-meta .location").first().text().trim() || "";
    const department = $(".text.department, .post-meta .department").first().text().trim() || "";

    const description = this.extractLeverDescription($);
    const requirements = this.extractRequirements($);

    const postedAt = this.extractDate($);

    return {
      url,
      title,
      company,
      department,
      location,
      description,
      requirements,
      postedAt,
      metadata: { ats: "lever" },
    };
  }

  private extractLeverDescription($: cheerio.CheerioAPI): string {
    const content = $(".section.page-full, .post-content").first();
    if (!content.length) return "";

    // Remove requirements section
    content.find(".section.requirements, #requirements").remove();

    const text = content
      .find("p, li")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(text);
  }

  /**
   * Parse Workday job posting.
   */
  private parseWorkday($: cheerio.CheerioAPI, url: string): JobPostingData | null {
    const title = $("h1, .job-title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() || "";

    if (!title) return null;

    const company = $('meta[property="og:site_name"]').attr("content")?.trim() || "";
    const location = $(".job-location, .location").first().text().trim() || "";
    const department = $(".job-department, .department").first().text().trim() || "";

    const description = this.extractWorkdayDescription($);
    const requirements = this.extractRequirements($);

    const postedAt = this.extractDate($);

    return {
      url,
      title,
      company,
      department,
      location,
      description,
      requirements,
      postedAt,
      metadata: { ats: "workday" },
    };
  }

  private extractWorkdayDescription($: cheerio.CheerioAPI): string {
    const content = $(".job-description, .job-details").first();
    if (!content.length) return "";

    content.find(".requirements, .qualifications").remove();

    const text = content
      .find("p, li")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 0)
      .join("\n\n");

    return this.cleanText(text);
  }

  /**
   * Parse generic job posting (custom career pages).
   */
  private parseGenericJob($: cheerio.CheerioAPI, url: string): JobPostingData | null {
    const title = this.extractJobTitle($);
    if (!title) return null;

    const company = this.extractCompany($);
    const location = this.extractLocation($);
    const department = this.extractDepartment($);
    const description = this.extractJobDescription($);
    const requirements = this.extractRequirements($);
    const postedAt = this.extractDate($);

    return {
      url,
      title,
      company,
      department,
      location,
      description,
      requirements,
      postedAt,
      metadata: { ats: "generic" },
    };
  }

  private extractJobTitle($: cheerio.CheerioAPI): string {
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) return ogTitle.trim();

    const schemaTitle = $('[itemprop="title"]').first().text().trim();
    if (schemaTitle) return schemaTitle;

    const h1 = $("h1").first().text().trim();
    if (h1) return h1;

    const title = $("title").first().text().trim();
    if (title) return title;

    return "";
  }

  private extractCompany($: cheerio.CheerioAPI): string {
    const ogSite = $('meta[property="og:site_name"]').attr("content");
    if (ogSite) return ogSite.trim();

    const schemaOrg = $('[itemprop="hiringOrganization"]').first().text().trim();
    if (schemaOrg) return schemaOrg;

    const companyName = $(".company-name, .employer").first().text().trim();
    if (companyName) return companyName;

    return "";
  }

  private extractLocation($: cheerio.CheerioAPI): string {
    const schemaLoc = $('[itemprop="jobLocation"]').first().text().trim();
    if (schemaLoc) return schemaLoc;

    const location = $(".location, .job-location, .city").first().text().trim();
    if (location) return location;

    return "";
  }

  private extractDepartment($: cheerio.CheerioAPI): string {
    const department = $(".department, .team, .division").first().text().trim();
    if (department) return department;

    return "";
  }

  private extractJobDescription($: cheerio.CheerioAPI): string {
    $("script, style, nav, header, footer, aside, iframe").remove();

    const selectors = [
      '[itemprop="description"]',
      ".job-description, .job-details, .posting-content",
      '[class*="description"], [class*="job-content"]',
    ];

    for (const selector of selectors) {
      const content = $(selector).first();
      if (content.length) {
        content.find(".requirements, .qualifications, #requirements").remove();

        const text = content
          .find("p, li")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 0)
          .join("\n\n");

        if (text.length > 100) {
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

  private extractRequirements($: cheerio.CheerioAPI): string[] {
    const selectors = [
      ".requirements, .qualifications, #requirements",
      '[class*="requirements"], [class*="qualifications"]',
    ];

    for (const selector of selectors) {
      const section = $(selector).first();
      if (section.length) {
        const items = section
          .find("li")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((t) => t.length > 0);

        if (items.length > 0) {
          return items;
        }
      }
    }

    return [];
  }

  private extractDate($: cheerio.CheerioAPI): Date | null {
    let dateStr: string | undefined;

    dateStr = $('meta[property="article:published_time"]').attr("content");

    if (!dateStr) {
      dateStr = $('[itemprop="datePosted"]').attr("content") ||
        $('[itemprop="datePosted"]').first().text().trim();
    }

    if (!dateStr) {
      dateStr = $("time").first().attr("datetime") || $("time").first().attr("content");
    }

    if (dateStr) {
      const date = new Date(dateStr.trim());
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  private cleanText(text: string): string {
    text = text.replace(/\n{3,}/g, "\n\n");
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.join("\n");
  }
}
