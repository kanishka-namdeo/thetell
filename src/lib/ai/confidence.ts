/**
 * Composite confidence scoring for analysis results.
 * Translated from backend/app/analysis/confidence.py
 */

import type { Fact, StrategicTheme, SourceType } from "./types";
import type { AgentPersona } from "./agent/types";
import type { ExtractedEntities } from "@/lib/nlp";

/**
 * Source-type credibility weights for correlation and inference weighting.
 * Higher values indicate more reliable/authoritative source types.
 */
const SOURCE_CREDIBILITY_WEIGHTS: Record<SourceType, number> = {
  FILING: 1.0,
  TRANSCRIPT: 0.95,
  NEWS: 0.90,
  RSS: 0.85,
  BLOG: 0.80,
  PRESS_RELEASE: 0.80,
  PATENT: 0.75,
  FDA: 0.75,
  ACADEMIC: 0.75,
  LITIGATION: 0.70,
  CONTRACT: 0.70,
  LEGISLATION: 0.70,
  LOBBYING: 0.70,
  CONFERENCE: 0.65,
  WEB_ARCHIVE: 0.65,
  TECH_SIGNAL: 0.60,
  JOB_POSTING: 0.60,
  PODCAST: 0.55,
  SOCIAL: 0.50,
};

/**
 * Calculate signal weight by source type credibility.
 *
 * Filing and transcript sources receive the highest weight; social media
 * receives the lowest but can be boosted by high engagement.
 *
 * @param sourceType - The signal's source type
 * @param engagement - Optional engagement metadata (e.g. `{ score: number }`)
 * @returns Weight multiplier >= 0.5
 */
export function calculateSignalWeight(
  sourceType: SourceType,
  engagement?: Record<string, unknown> | null,
): number {
  const baseWeight = SOURCE_CREDIBILITY_WEIGHTS[sourceType] ?? 0.5;

  if (sourceType === "SOCIAL" && engagement) {
    const score = typeof engagement.score === "number" ? engagement.score : 0;
    const engagementMultiplier = Math.min(2.0, 1 + Math.log10(score + 1) * 0.2);
    return baseWeight * engagementMultiplier;
  }

  return baseWeight;
}

export interface ConfidenceParams {
  sourceType: SourceType;
  contentLength: number;
  content?: string;
  facts: Fact[];
  themes: StrategicTheme[];
  llmConfidence: number;
  agentPersona?: AgentPersona;
  entities?: ExtractedEntities;
  engagement?: { score?: number; comments?: number };
  sourceMatchesPreference?: boolean;
  publishedAt?: Date | null;
}

/**
 * Calculate recency decay multiplier based on signal publication date.
 * Older signals receive lower confidence scores for current strategic inference.
 *
 * @param publishedAt - Publication date of the signal (null = no penalty)
 * @param sourceType - Source type for type-specific decay curves
 * @returns Multiplier between 0.65 and 1.0
 */
function calculateRecencyMultiplier(publishedAt: Date | null | undefined, sourceType?: SourceType): number {
  if (!publishedAt) return 1.0;

  const now = new Date();
  const ageInDays = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Wayback Machine snapshots are inherently historical — use gentler decay
  if (sourceType === "WEB_ARCHIVE") {
    if (ageInDays < 30) return 1.0;
    if (ageInDays < 180) return 0.95;
    if (ageInDays < 365) return 0.90;
    return 0.85;
  }

  if (ageInDays < 7) return 1.0;      // < 7 days: no decay
  if (ageInDays < 30) return 0.95;    // 7-30 days: slight decay
  if (ageInDays < 90) return 0.85;    // 30-90 days: moderate decay
  if (ageInDays < 365) return 0.75;   // 90-365 days: significant decay
  return 0.65;                        // > 1 year: heavy decay
}

/**
 * Calculate engagement-based confidence boost for social signals.
 * High-engagement posts (upvotes, comments) indicate community validation.
 * Returns a multiplier (>=1.0) to apply to base confidence.
 */
export function calculateEngagementBoost(engagement?: { score?: number; comments?: number }): number {
  if (!engagement) return 1.0;

  const score = Math.max(0, engagement.score ?? 0);
  const comments = Math.max(0, engagement.comments ?? 0);

  const scoreBoost = Math.min(1.5, 1 + Math.log10(score + 1) * 0.1);
  const commentBoost = Math.min(1.3, 1 + Math.log10(comments + 1) * 0.05);

  return scoreBoost * commentBoost;
}

/**
 * Calculate URL path specificity for wayback signals.
 * Rewards detailed paths with meaningful segments over bare domains.
 */
function calculateUrlSpecificity(content: string): number {
  const hasDetailedPaths = content.includes('/') && content.length > 100;
  if (!hasDetailedPaths) return 0.3;
  
  const pathSegments = (content.match(/\//g) || []).length;
  return Math.min(1.0, pathSegments / 10);
}

/**
 * Detect if content includes page type labels.
 * Wayback snapshots often include page type metadata.
 */
function detectPageTypeInContent(content: string): boolean {
  return content.includes('page') || 
         content.includes('Homepage') ||
         content.includes('Pricing') ||
         content.includes('Product');
}

/**
 * Calculate content specificity based on numbers, dates, and named entities.
 * Returns a score between 0.0 and 1.0.
 *
 * Task 3.7: Now uses NER results when available, falls back to regex.
 */
function calculateContentSpecificity(content: string, entities?: ExtractedEntities): number {
  const numbers = (content.match(/\d+/g) || []).length;
  const dates = (content.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) || []).length;

  // Use NER entity count if available, otherwise fall back to regex
  let namedEntities: number;
  if (entities) {
    namedEntities =
      entities.persons.length +
      entities.organizations.length +
      entities.locations.length +
      entities.dates.length +
      entities.monetary.length;
  } else {
    namedEntities = (content.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g) || []).length;
  }

  const specificityScore = Math.min(1.0, (numbers * 0.1 + dates * 0.2 + namedEntities * 0.05));
  return specificityScore;
}

/**
 * Calculate composite confidence score for an analysis.
 *
 * Factors:
 * - Source reliability (0.0-1.0 weight)
 * - Content quality (length, specificity)
 * - Fact confidence (average of fact confidences)
 * - Theme evidence strength
 * - LLM self-reported confidence
 *
 * Returns a score between 0.0 and 1.0.
 */
export function calculateConfidence(params: ConfidenceParams): number {
  const { sourceType, contentLength, content, facts, themes, llmConfidence, agentPersona, entities, engagement } = params;

  // Source reliability weights (reduced by 15-20% for better variance)
  const sourceWeights: Record<SourceType, number> = {
    FILING: 0.80,
    TRANSCRIPT: 0.75,
    NEWS: 0.65,
    BLOG: 0.55,
    SOCIAL: 0.40,
    JOB_POSTING: 0.60,
    RSS: 0.65,
    PATENT: 0.75,
    LITIGATION: 0.70,
    FDA: 0.75,
    CONTRACT: 0.70,
    TECH_SIGNAL: 0.60,
    WEB_ARCHIVE: 0.65,
    LEGISLATION: 0.70,
    ACADEMIC: 0.65,
    PODCAST: 0.55,
    CONFERENCE: 0.60,
    PRESS_RELEASE: 0.65,
    LOBBYING: 0.70,
  };
  const sourceScore = sourceWeights[sourceType] ?? 0.7;

  // Content quality score (based on length and specificity)
  // Optimal range: 500-5000 characters
  let contentScore: number;
  
  // Wayback Machine signals use different scoring - reward URL specificity and page metadata
  if (sourceType === "WEB_ARCHIVE") {
    const urlSpecificity = calculateUrlSpecificity(content || "");
    const pageTypeDetected = detectPageTypeInContent(content || "");
    const significantChange = (content || "").includes("Significant: Yes") ? 1.0 : 0.7;
    contentScore = urlSpecificity * 0.4 + (pageTypeDetected ? 1.0 : 0.5) * 0.3 + significantChange * 0.3;
  } else if (contentLength < 100) {
    contentScore = 0.3;
  } else if (contentLength < 500) {
    contentScore = 0.6;
  } else if (contentLength <= 5000) {
    contentScore = 0.9;
  } else {
    contentScore = 0.85; // Very long content, slightly lower
  }

  // Blend with content specificity if content provided
  if (content) {
    const specificity = calculateContentSpecificity(content, entities);
    contentScore = contentScore * 0.7 + specificity * 0.3;
  }

  // Fact confidence score
  let factScore: number;
  if (facts.length > 0) {
    const avgFactConfidence =
      facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length;
    factScore = avgFactConfidence;
  } else {
    factScore = 0.5; // No facts extracted, moderate confidence
  }

  // Theme evidence score
  let themeScore: number;
  if (themes.length > 0) {
    const totalEvidence = themes.reduce((sum, t) => sum + t.evidence.length, 0);
    if (totalEvidence === 0) {
      themeScore = 0.4;
    } else if (totalEvidence < themes.length * 2) {
      themeScore = 0.7;
    } else {
      themeScore = 0.9;
    }
  } else {
    themeScore = 0.5; // No themes identified
  }

  // Weighted composite score — agent-specific weights when persona provided
  let composite: number;

  if (agentPersona === "ANALYST") {
    // Analyst: source reliability 20%, content quality 20%, fact verifiability 35%, theme evidence 25%
    composite =
      sourceScore * 0.20 +
      contentScore * 0.20 +
      factScore * 0.35 +
      themeScore * 0.25;
  } else if (agentPersona === "GOSSIP_GIRL") {
    // Gossip Girl: tell clarity 40%, behavioral pattern density 25%, source credibility 20%, narrative coherence 15%
    // Note: Uses tell_strength from sentiment as "tell clarity" — this measures how revealing the subtext is,
    // not analytical confidence. Behavioral pattern density measures how many tells were found.
    const behavioralPatternScore = Math.min(1.0, facts.length / 10);
    composite =
      llmConfidence * 0.40 +
      behavioralPatternScore * 0.25 +
      sourceScore * 0.20 +
      themeScore * 0.15;
  } else {
    // Default (backward compat)
    const weights = {
      source: 0.25,
      content: 0.15,
      facts: 0.3,
      themes: 0.15,
      llm: 0.15,
    };
    composite =
      sourceScore * weights.source +
      contentScore * weights.content +
      factScore * weights.facts +
      themeScore * weights.themes +
      llmConfidence * weights.llm;
  }

  // Apply engagement boost for SOCIAL source type
  if (sourceType === 'SOCIAL' && engagement) {
    const boost = calculateEngagementBoost(engagement);
    composite *= boost;
  }

  // Apply preference boost when agent's sourcePreferences match the signal's source type
  if (params.sourceMatchesPreference) {
    composite *= 1.15;
  }

  // Apply recency decay based on publication date
  const recencyMultiplier = calculateRecencyMultiplier(params.publishedAt, sourceType);
  composite *= recencyMultiplier;

  // Clamp to [0.0, 1.0]
  return Math.max(0.0, Math.min(1.0, composite));
}
