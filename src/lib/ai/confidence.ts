/**
 * Composite confidence scoring for analysis results.
 * Translated from backend/app/analysis/confidence.py
 */

import type { Fact, StrategicTheme, SourceType } from "./types";

interface ConfidenceParams {
  sourceType: SourceType;
  contentLength: number;
  facts: Fact[];
  themes: StrategicTheme[];
  llmConfidence: number;
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
  const { sourceType, contentLength, facts, themes, llmConfidence } = params;

  // Source reliability weights
  const sourceWeights: Record<SourceType, number> = {
    FILING: 0.95,
    TRANSCRIPT: 0.9,
    NEWS: 0.8,
    BLOG: 0.65,
    SOCIAL: 0.5,
    JOB_POSTING: 0.7,
    RSS: 0.75,
    PATENT: 0.9,
    LITIGATION: 0.85,
    FDA: 0.9,
    CONTRACT: 0.85,
    TECH_SIGNAL: 0.7,
    WEB_ARCHIVE: 0.75,
    LEGISLATION: 0.85,
    ACADEMIC: 0.8,
    PODCAST: 0.65,
    CONFERENCE: 0.7,
    PRESS_RELEASE: 0.8,
  };
  const sourceScore = sourceWeights[sourceType] ?? 0.7;

  // Content quality score (based on length)
  // Optimal range: 500-5000 characters
  let contentScore: number;
  if (contentLength < 100) {
    contentScore = 0.3;
  } else if (contentLength < 500) {
    contentScore = 0.6;
  } else if (contentLength <= 5000) {
    contentScore = 0.9;
  } else {
    contentScore = 0.85; // Very long content, slightly lower
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

  // Weighted composite score
  const weights = {
    source: 0.25,
    content: 0.15,
    facts: 0.3,
    themes: 0.15,
    llm: 0.15,
  };

  const composite =
    sourceScore * weights.source +
    contentScore * weights.content +
    factScore * weights.facts +
    themeScore * weights.themes +
    llmConfidence * weights.llm;

  // Clamp to [0.0, 1.0]
  return Math.max(0.0, Math.min(1.0, composite));
}
