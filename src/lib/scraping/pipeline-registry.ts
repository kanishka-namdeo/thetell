/**
 * Static registry of all data collection scrapers.
 * Maps scraper internal names to display metadata for the admin pipeline UI.
 */

import type { SourceType } from "@prisma/client";

export interface ScraperRegistryEntry {
  /** Internal key matching the discovery function step name */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Signal source type produced by this scraper */
  sourceType: SourceType;
  /** What this scraper collects */
  description: string;
  /** External platform name where data is collected from */
  platformName: string;
  /** Lucide icon name for UI display */
  icon: string;
  /** Whether this scraper is globally enabled */
  enabled: boolean;
}

export const SCRAPER_REGISTRY: ScraperRegistryEntry[] = [
  {
    name: "rss-feed",
    displayName: "RSS Feeds",
    sourceType: "RSS",
    description: "Monitors company RSS feeds and news sources for new content",
    platformName: "Various RSS",
    icon: "Rss",
    enabled: true,
  },
  {
    name: "sec-filing",
    displayName: "SEC Filings",
    sourceType: "FILING",
    description: "Tracks SEC EDGAR filings (10-K, 10-Q, 8-K) for public companies",
    platformName: "SEC EDGAR",
    icon: "FileText",
    enabled: true,
  },
  {
    name: "github",
    displayName: "GitHub Activity",
    sourceType: "TECH_SIGNAL",
    description: "Monitors GitHub organization repositories and activity",
    platformName: "GitHub",
    icon: "Github",
    enabled: true,
  },
  {
    name: "cert-transparency",
    displayName: "Certificate Transparency",
    sourceType: "TECH_SIGNAL",
    description: "Tracks new SSL/TLS certificates issued for company domains",
    platformName: "Google CT",
    icon: "Shield",
    enabled: true,
  },
  {
    name: "reddit-financial",
    displayName: "Reddit Financial",
    sourceType: "SOCIAL",
    description: "Scrapes financial subreddits for company mentions and sentiment",
    platformName: "Reddit",
    icon: "MessageSquare",
    enabled: true,
  },
  {
    name: "press-release",
    displayName: "Press Releases",
    sourceType: "PRESS_RELEASE",
    description: "Monitors press release wires for company announcements",
    platformName: "PR Wires",
    icon: "Megaphone",
    enabled: true,
  },
  {
    name: "uspto",
    displayName: "USPTO Patents",
    sourceType: "PATENT",
    description: "Tracks patent applications and grants by company assignee",
    platformName: "USPTO",
    icon: "Lightbulb",
    enabled: true,
  },
  {
    name: "courtlistener",
    displayName: "CourtListener",
    sourceType: "LITIGATION",
    description: "Monitors federal court cases involving companies as parties",
    platformName: "CourtListener",
    icon: "Scale",
    enabled: true,
  },
  {
    name: "fda",
    displayName: "FDA Events",
    sourceType: "FDA",
    description: "Tracks FDA drug adverse events and device clearances for pharma companies",
    platformName: "FDA.gov",
    icon: "Pill",
    enabled: true,
  },
  {
    name: "sam",
    displayName: "SAM.gov Contracts",
    sourceType: "CONTRACT",
    description: "Monitors government contract awards by vendor name",
    platformName: "SAM.gov",
    icon: "Building2",
    enabled: true,
  },
  {
    name: "wayback",
    displayName: "Wayback Machine",
    sourceType: "WEB_ARCHIVE",
    description: "Detects changes in company websites via internet archive snapshots",
    platformName: "Archive.org",
    icon: "Globe",
    enabled: true,
  },
  {
    name: "congress",
    displayName: "Congress.gov",
    sourceType: "LEGISLATION",
    description: "Tracks legislation mentioning companies in Congressional records",
    platformName: "Congress.gov",
    icon: "Landmark",
    enabled: true,
  },
  {
    name: "academic",
    displayName: "Academic Papers",
    sourceType: "ACADEMIC",
    description: "Monitors academic publications referencing companies",
    platformName: "Semantic Scholar",
    icon: "GraduationCap",
    enabled: true,
  },
  {
    name: "app-store",
    displayName: "App Store RSS",
    sourceType: "TECH_SIGNAL",
    description: "Tracks Apple App Store top charts and new releases via Apple RSS feeds",
    platformName: "Apple Marketing Tools",
    icon: "Smartphone",
    enabled: true,
  },
  {
    name: "conference",
    displayName: "Conference Agendas",
    sourceType: "CONFERENCE",
    description: "Monitors tech conference schedules for company appearances and announcements",
    platformName: "Various Conferences",
    icon: "Calendar",
    enabled: true,
  },
];

/**
 * Look up a scraper by its internal name.
 */
export function getScraperByName(name: string): ScraperRegistryEntry | undefined {
  return SCRAPER_REGISTRY.find((s) => s.name === name);
}

/**
 * Get all enabled scrapers.
 */
export function getEnabledScrapers(): ScraperRegistryEntry[] {
  return SCRAPER_REGISTRY.filter((s) => s.enabled);
}

/**
 * Get the total count of registered scrapers.
 */
export function getTotalScraperCount(): number {
  return SCRAPER_REGISTRY.length;
}
