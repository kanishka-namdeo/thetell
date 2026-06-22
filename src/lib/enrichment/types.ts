/**
 * Shared types and Zod schemas for the company enrichment pipeline.
 */

import { z } from "zod";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DiscoveredFeed {
  url: string;
  label: string;
  sourceType: string;
  confidence: number;
  discoveryMethod: string;
}

export interface DiscoveredSocial {
  url: string;
  platform: string;
  handle: string;
  source: "website-link" | "web-search";
}

export interface TickerLookupResult {
  ticker: string | null;
  exchange: string | null;
  confidence: number;
}

export interface EnrichmentResult {
  companyId: string;
  feeds: DiscoveredFeed[];
  socials: DiscoveredSocial[];
  ticker: TickerLookupResult | null;
  blogs: DiscoveredFeed[];
  status: "success" | "partial" | "failed";
  error?: string;
}

// ─── Zod Schemas (for LLM structured output) ────────────────────────────────

export const TickerSuggestionSchema = z.object({
  ticker: z.string().nullable(),
  exchange: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const SocialProfileSchema = z.object({
  profiles: z.array(
    z.object({
      platform: z.string(),
      url: z.string().url(),
      handle: z.string(),
    })
  ),
});
