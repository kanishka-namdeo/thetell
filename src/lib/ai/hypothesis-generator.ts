/**
 * Hypothesis generator for hypothesis-driven intelligence collection.
 *
 * Analyzes existing signal patterns (recent analyses + trending themes)
 * and generates investigative questions that guide future scraper priority.
 */

import { z } from "zod";
import { getProvider } from "./provider";
import { logger } from "@/lib/logger";

// ─── Zod Schemas ────────────────────────────────────────────────────────────

export const HypothesisSchema = z.object({
  question: z
    .string()
    .describe(
      "An investigative question, e.g. 'Is Apple expanding India manufacturing?'"
    ),
  priority: z
    .number()
    .min(0)
    .max(1)
    .describe("Priority score 0-1 based on signal convergence and theme momentum"),
  sourceWeights: z
    .array(
      z.object({
        source: z.string().describe("Source type enum value"),
        weight: z.number().min(0).max(1).describe("Weight 0-1 indicating likelihood of evidence"),
      })
    )
    .describe(
      "Source types with weights most likely to yield evidence, e.g. [{source: 'JOB_POSTING', weight: 0.9}, {source: 'FILING', weight: 0.7}]"
    ),
  rationale: z
    .string()
    .describe("Brief explanation of why this hypothesis was generated"),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const HypothesisGeneratorOutputSchema = z.object({
  hypotheses: z.array(HypothesisSchema).max(10),
});

export type HypothesisGeneratorOutput = z.infer<
  typeof HypothesisGeneratorOutputSchema
>;

// ─── Input Types ────────────────────────────────────────────────────────────

export interface RecentAnalysis {
  signalId: string;
  summary: string;
  keyFacts: Array<{ text: string }>;
  strategicThemes: Array<{ label: string }>;
  sentiment: string;
  confidence: number;
  sourceType: string;
}

export interface ThemeWithMomentum {
  id: string;
  label: string;
  momentum: number;
  status: string;
}

// ─── Generator ──────────────────────────────────────────────────────────────

/**
 * Generate investigative hypotheses for a company based on recent analyses
 * and current theme momentum.
 *
 * Uses structured LLM output via Zod schema.
 */
export async function generateHypotheses(
  companyId: string,
  companyName: string,
  recentAnalyses: RecentAnalysis[],
  themes: ThemeWithMomentum[]
): Promise<Hypothesis[]> {
  const log = logger.child({
    module: "hypothesis-generator",
    companyId,
  });

  if (recentAnalyses.length === 0 && themes.length === 0) {
    log.info("hypothesis_generator.no_input_data");
    return [];
  }

  const provider = getProvider("openai");

  // Build a compact summary of recent analyses for the prompt
  const analysisSummary = recentAnalyses.slice(0, 15).map((a) => ({
    summary: a.summary.slice(0, 200),
    themes: a.strategicThemes.map((t) => t.label).join(", "),
    sourceType: a.sourceType,
    sentiment: a.sentiment,
    confidence: Math.round(a.confidence * 100) / 100,
  }));

  // Build theme momentum summary
  const themeSummary = themes
    .filter((t) => t.momentum > 0 || t.status !== "FADING")
    .slice(0, 10)
    .map((t) => ({
      label: t.label,
      momentum: Math.round(t.momentum * 100) / 100,
      status: t.status,
    }));

  const messages = [
    {
      role: "system" as const,
      content: `You are a corporate intelligence analyst specializing in hypothesis-driven investigation.

Given recent signal analyses and trending themes for a company, generate investigative hypotheses — questions that, if confirmed, would reveal strategic intent.

Rules:
- Each hypothesis must be a specific, testable question (not vague)
- Prioritize hypotheses where multiple signal types converge
- sourceWeights should list the source types most likely to provide evidence (use enum values: NEWS, FILING, TRANSCRIPT, SOCIAL, BLOG, JOB_POSTING, RSS, PATENT, LITIGATION, FDA, CONTRACT, TECH_SIGNAL, WEB_ARCHIVE, LEGISLATION, ACADEMIC, PODCAST, CONFERENCE, PRESS_RELEASE, LOBBYING)
- Priority should reflect: (1) theme momentum, (2) cross-source convergence, (3) strategic significance
- Generate 3-8 hypotheses, ranked by priority descending
- Include a brief rationale for each hypothesis`,
    },
    {
      role: "user" as const,
      content: `Company: ${companyName} (ID: ${companyId})

Recent Signal Analyses (${analysisSummary.length}):
${JSON.stringify(analysisSummary, null, 2)}

Trending Themes (${themeSummary.length}):
${JSON.stringify(themeSummary, null, 2)}

Generate investigative hypotheses that would reveal this company's strategic intent. Focus on questions where converging signals suggest an answer may be findable.`,
    },
  ];

  try {
    const result = await provider.completeStructured(
      messages,
      HypothesisGeneratorOutputSchema,
      { temperature: 0.4 }
    );

    log.info("hypothesis_generator.success", {
      hypothesisCount: result.hypotheses.length,
    });

    return result.hypotheses;
  } catch (error) {
    log.error("hypothesis_generator.llm_failed", { error: String(error) });

    // Fallback: generate simple hypotheses from theme momentum
    return themes
      .filter((t) => t.momentum > 0.2)
      .slice(0, 5)
      .map((t) => ({
        question: `Is ${companyName} actively pursuing ${t.label.toLowerCase()}?`,
        priority: Math.min(t.momentum, 1.0),
        sourceWeights: inferSourceWeights(t.label),
        rationale: `Generated from trending theme "${t.label}" with momentum ${t.momentum.toFixed(2)}`,
      }));
  }
}

/**
 * Infer likely source weights from a theme label when LLM generation fails.
 * Returns array of source-weight pairs, sorted by weight descending.
 */
function inferSourceWeights(themeLabel: string): Array<{ source: string; weight: number }> {
  const lower = themeLabel.toLowerCase();

  // Hiring/recruitment themes
  if (lower.includes("hiring") || lower.includes("recruit") || lower.includes("team")) {
    return [
      { source: "JOB_POSTING", weight: 0.9 },
      { source: "NEWS", weight: 0.7 },
      { source: "SOCIAL", weight: 0.8 },
    ];
  }

  // Product launch themes
  if (lower.includes("product-launch") || lower.includes("product launch") || lower.includes("launch")) {
    return [
      { source: "NEWS", weight: 0.8 },
      { source: "SOCIAL", weight: 0.7 },
      { source: "BLOG", weight: 0.7 },
      { source: "FILING", weight: 0.4 },
    ];
  }

  // Culture and workplace issues
  if (lower.includes("culture") || lower.includes("workplace") || lower.includes("employee")) {
    return [
      { source: "SOCIAL", weight: 0.9 },
      { source: "NEWS", weight: 0.6 },
      { source: "BLOG", weight: 0.5 },
      { source: "FILING", weight: 0.2 },
    ];
  }

  // Public sentiment and brand perception
  if (lower.includes("sentiment") || lower.includes("brand") || lower.includes("reputation")) {
    return [
      { source: "SOCIAL", weight: 0.95 },
      { source: "NEWS", weight: 0.7 },
      { source: "BLOG", weight: 0.6 },
      { source: "FILING", weight: 0.1 },
    ];
  }

  // Regulatory and compliance themes
  if (lower.includes("regulatory") || lower.includes("compliance") || lower.includes("legal")) {
    return [
      { source: "FILING", weight: 0.95 },
      { source: "NEWS", weight: 0.8 },
      { source: "SOCIAL", weight: 0.3 },
      { source: "BLOG", weight: 0.2 },
    ];
  }

  // Patent and technology themes
  if (lower.includes("patent") || lower.includes("technology") || lower.includes("R&D")) {
    return [
      { source: "PATENT", weight: 0.9 },
      { source: "TECH_SIGNAL", weight: 0.8 },
      { source: "ACADEMIC", weight: 0.7 },
    ];
  }

  // Litigation themes
  if (lower.includes("litigation") || lower.includes("lawsuit")) {
    return [
      { source: "LITIGATION", weight: 0.95 },
      { source: "FILING", weight: 0.8 },
      { source: "LEGISLATION", weight: 0.6 },
    ];
  }

  // Financial themes
  if (lower.includes("financial") || lower.includes("revenue") || lower.includes("earnings")) {
    return [
      { source: "FILING", weight: 0.9 },
      { source: "TRANSCRIPT", weight: 0.8 },
      { source: "NEWS", weight: 0.7 },
    ];
  }

  // Manufacturing and expansion themes
  if (lower.includes("manufacturing") || lower.includes("supply") || lower.includes("expansion")) {
    return [
      { source: "FILING", weight: 0.8 },
      { source: "JOB_POSTING", weight: 0.7 },
      { source: "PRESS_RELEASE", weight: 0.6 },
    ];
  }

  // M&A themes
  if (lower.includes("acquisition") || lower.includes("merger") || lower.includes("M&A")) {
    return [
      { source: "FILING", weight: 0.9 },
      { source: "NEWS", weight: 0.8 },
      { source: "PRESS_RELEASE", weight: 0.7 },
    ];
  }

  // Default fallback for unknown themes
  return [
    { source: "NEWS", weight: 0.7 },
    { source: "FILING", weight: 0.6 },
    { source: "PRESS_RELEASE", weight: 0.5 },
  ];
}
