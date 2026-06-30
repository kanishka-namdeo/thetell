/**
 * Gap analyzer for source coverage.
 *
 * Identifies missing source type coverage based on discovered sources
 * and recommends additional sources to fill gaps.
 */

import type { SourceType } from "@prisma/client";

export interface SourceCoverage {
  covered: SourceType[];
  missing: SourceType[];
  recommendations: string[];
}

// Define the ideal source coverage for comprehensive monitoring
const IDEAL_SOURCE_TYPES: SourceType[] = [
  "NEWS",
  "FILING",
  "SOCIAL",
  "BLOG",
  "JOB_POSTING",
  "PATENT",
  "LITIGATION",
  "TECH_SIGNAL",
  "PRESS_RELEASE",
  "CONFERENCE",
];

export function identifyGaps(discoveredSourceTypes: SourceType[]): SourceCoverage {
  const covered = [...new Set(discoveredSourceTypes)];
  const missing = IDEAL_SOURCE_TYPES.filter((type) => !covered.includes(type));

  const recommendations: string[] = [];

  if (missing.includes("NEWS")) {
    recommendations.push("Add news RSS feeds via Google News or company press room");
  }
  if (missing.includes("FILING")) {
    recommendations.push("Set up SEC EDGAR monitoring for 10-K, 10-Q, 8-K filings");
  }
  if (missing.includes("SOCIAL")) {
    recommendations.push("Track company Twitter/X and LinkedIn accounts");
  }
  if (missing.includes("BLOG")) {
    recommendations.push("Discover and subscribe to company blog RSS feed");
  }
  if (missing.includes("JOB_POSTING")) {
    recommendations.push("Monitor LinkedIn and company careers page for hiring signals");
  }
  if (missing.includes("PATENT")) {
    recommendations.push("Set up USPTO patent application monitoring");
  }
  if (missing.includes("LITIGATION")) {
    recommendations.push("Track CourtListener for litigation records");
  }
  if (missing.includes("TECH_SIGNAL")) {
    recommendations.push("Monitor GitHub organization for engineering activity");
  }
  if (missing.includes("PRESS_RELEASE")) {
    recommendations.push("Subscribe to company press release wire");
  }
  if (missing.includes("CONFERENCE")) {
    recommendations.push("Track conference appearances and speaking engagements");
  }

  return {
    covered: covered as SourceType[],
    missing: missing as SourceType[],
    recommendations,
  };
}
