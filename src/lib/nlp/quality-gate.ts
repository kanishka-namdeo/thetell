/**
 * Content quality gate using zero-shot classification.
 *
 * Opportunity 2 from the Local NLP Model Integration Plan.
 * Pre-pipeline filter that scores "analysis worthiness" before the expensive LLM pipeline.
 *
 * Model: Xenova/bart-large-mnli (zero-shot classification)
 * Labels: ["substantive analysis", "boilerplate content", "irrelevant mention"]
 */

import { getModelPipeline } from "./model-cache";
import { logger } from "@/lib/logger";

export interface QualityAssessment {
  score: number;
  pass: boolean;
  reasons: string[];
}

const QUALITY_THRESHOLD = 0.4;

/**
 * Compute information density: entities, numbers, and dates per paragraph.
 */
function computeInformationDensity(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (paragraphs.length === 0) return 0;

  let totalSignals = 0;
  for (const para of paragraphs) {
    const numbers = (para.match(/\d+/g) || []).length;
    const dates = (para.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi) || []).length;
    const dollarAmounts = (para.match(/\$[\d,.]+/g) || []).length;
    const percentages = (para.match(/\d+(?:\.\d+)?%/g) || []).length;
    const capitalizedPhrases = (para.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g) || []).length;

    totalSignals += numbers + dates + dollarAmounts + percentages + capitalizedPhrases;
  }

  // Normalize: signals per paragraph, capped at 10
  const densityPerParagraph = totalSignals / paragraphs.length;
  return Math.min(1.0, densityPerParagraph / 10);
}

/**
 * Check how strongly the company is mentioned in the text.
 */
function computeCompanyMentionStrength(text: string, companyName: string): number {
  if (!companyName) return 0.5; // No company to check against

  const lowerText = text.toLowerCase();
  const lowerName = companyName.toLowerCase();

  // Check for exact name matches
  const exactMatches = lowerText.split(lowerName).length - 1;

  // Check for ticker-style mentions (all-caps short references)
  const escapedFirst = companyName.split(/\s+/)[0]?.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tickerPattern = escapedFirst ? new RegExp(`\\b${escapedFirst}\\b`, "g") : null;
  const tickerMatches = tickerPattern ? (text.match(tickerPattern) || []).length : 0;

  // Score: at least 1 mention is good, more is better
  const totalMentions = exactMatches + tickerMatches * 0.5;
  return Math.min(1.0, totalMentions / 3);
}

/**
 * Assess whether content is worth sending through the LLM analysis pipeline.
 *
 * Signals scoring below QUALITY_THRESHOLD are flagged as LOW_QUALITY
 * and skip the expensive analysis step.
 */
export async function assessContentQuality(
  text: string,
  companyName: string,
): Promise<QualityAssessment> {
  const startTime = Date.now();
  const reasons: string[] = [];

  try {
    // Quick checks first (no model needed)
    if (!text || text.trim().length < 50) {
      return {
        score: 0.1,
        pass: false,
        reasons: ["Text too short for analysis (< 50 characters)"],
      };
    }

    // Compute heuristic scores
    const infoDensity = computeInformationDensity(text);
    const companyStrength = computeCompanyMentionStrength(text, companyName);

    // Try zero-shot classification for substance detection
    let substanceScore = 0.5; // Default neutral
    try {
      const classifier = await getModelPipeline(
        "zero-shot-classification",
        "Xenova/bart-large-mnli",
      ) as (text: string, labels: string[]) => Promise<{ labels: string[]; scores: number[] }>;

      const result = await classifier(text.slice(0, 1000), [
        "substantive analysis",
        "boilerplate content",
        "irrelevant mention",
      ]);

      // result.labels and result.scores are parallel arrays
      const labels = result.labels as string[];
      const scores = result.scores as number[];

      const substantiveIdx = labels.indexOf("substantive analysis");
      const boilerplateIdx = labels.indexOf("boilerplate content");
      const irrelevantIdx = labels.indexOf("irrelevant mention");

      const substantiveScore = substantiveIdx >= 0 ? scores[substantiveIdx] : 0;
      const boilerplateScore = boilerplateIdx >= 0 ? scores[boilerplateIdx] : 0;
      const irrelevantScore = irrelevantIdx >= 0 ? scores[irrelevantIdx] : 0;

      substanceScore = substantiveScore - (boilerplateScore * 0.5) - (irrelevantScore * 0.8);
      // Normalize to 0-1 range
      substanceScore = Math.max(0, Math.min(1, (substanceScore + 0.8) / 1.8));
    } catch (modelError) {
      logger.warn("nlp.quality.zeroshot_failed", {
        error: String(modelError),
        falling: "back to heuristic-only",
      });
      // Fall back to heuristic-only scoring
      substanceScore = 0.5;
    }

    // Composite score: weighted combination
    // substance: 40%, info density: 30%, company mention: 30%
    const compositeScore =
      substanceScore * 0.4 +
      infoDensity * 0.3 +
      companyStrength * 0.3;

    // Build reasons
    if (infoDensity < 0.2) {
      reasons.push("Low information density (few numbers, dates, or entities)");
    }
    if (companyStrength < 0.3 && companyName) {
      reasons.push(`Weak company mention for "${companyName}"`);
    }
    if (substanceScore < 0.3) {
      reasons.push("Content appears to be boilerplate or thin");
    }
    if (compositeScore >= QUALITY_THRESHOLD) {
      reasons.push("Content passes quality threshold");
    }

    const passes = compositeScore >= QUALITY_THRESHOLD;
    const elapsed = Date.now() - startTime;

    logger.info("nlp.quality.assessed", {
      score: Math.round(compositeScore * 1000) / 1000,
      pass: passes,
      substanceScore: Math.round(substanceScore * 1000) / 1000,
      infoDensity: Math.round(infoDensity * 1000) / 1000,
      companyStrength: Math.round(companyStrength * 1000) / 1000,
      elapsedMs: elapsed,
    });

    return {
      score: compositeScore,
      pass: passes,
      reasons,
    };
  } catch (error) {
    logger.error("nlp.quality.assessment_failed", {
      error: String(error),
      textLength: text.length,
    });
    // On error, allow through (better to analyze low-quality than miss high-quality)
    return {
      score: 0.5,
      pass: true,
      reasons: ["Quality assessment failed, defaulting to pass"],
    };
  }
}

export { QUALITY_THRESHOLD };
