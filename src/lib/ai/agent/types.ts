/**
 * Types for the agent abstraction layer.
 * Defines agent personas and their analysis output shapes.
 *
 * Each agent has its own Zod schemas and TypeScript types with
 * structurally divergent output shapes:
 * - Analyst: data-driven, category-based facts, market sentiment
 * - Gossip Girl: tell-based facts with subtext, narrative surface readings
 */

import { z } from "zod";

export type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

export interface AgentConfig {
  persona: AgentPersona;
  name: string;
  voice: string;
  sourcePreferences: string[];
  canCrossReference: boolean;
  temperature: number;
  forbiddenPhrases?: string[];
  structuralRules?: {
    sentenceLengthAvg?: number;
    paragraphLengthMax?: number;
    articleSections?: Array<{ name: string; description: string }>;
  };
}

// ---------------------------------------------------------------------------
// Analyst schemas — authoritative, data-driven Bloomberg Intelligence style
// ---------------------------------------------------------------------------

export const AnalystCategorySchema = z.enum([
  "financial",
  "strategic",
  "operational",
  "personnel",
  "market",
]);
export type AnalystCategory = z.infer<typeof AnalystCategorySchema>;

export const AnalystFactSchema = z.object({
  text: z.string(),
  category: z.preprocess((val) => {
    const normalized = String(val).toLowerCase();
    if (
      ["financial", "strategic", "operational", "personnel", "market"].includes(
        normalized,
      )
    ) {
      return normalized;
    }
    if (["regulatory", "legal", "compliance"].includes(normalized))
      return "strategic";
    if (["technology", "tech", "product", "innovation"].includes(normalized))
      return "strategic";
    if (["sales", "revenue", "pricing"].includes(normalized))
      return "market";
    if (["hiring", "talent", "team"].includes(normalized))
      return "personnel";
    if (["cost", "budget", "expense"].includes(normalized))
      return "financial";
    return "strategic";
  }, AnalystCategorySchema),
  source_sentence: z.string(),
  confidence: z.number().min(0).max(1),
});
export type AnalystFact = z.infer<typeof AnalystFactSchema>;

export const AnalystSentimentSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).default("NEUTRAL"),
  strength: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    const s = String(val).toUpperCase();
    if (s === "STRONGLY" || s === "STRONG") return "STRONGLY";
    if (s === "MILDY" || s === "MILD") return "MILDY";
    return undefined;
  }, z.enum(["STRONGLY", "MILDY"]).optional()),
  confidence: z.number().min(0).max(1),
  key_phrases: z.array(z.string()).default([]),
});
export type AnalystSentiment = z.infer<typeof AnalystSentimentSchema>;

export const AnalystThemeSchema = z.object({
  label: z.string(),
  evidence: z.array(z.string()).default([]),
  correlation_hints: z.array(z.string()).default([]),
});
export type AnalystTheme = z.infer<typeof AnalystThemeSchema>;

// ---------------------------------------------------------------------------
// Gossip Girl schemas — Page Six meets WSJ Heard on the Street
// ---------------------------------------------------------------------------

export const GossipTellTypeSchema = z.enum([
  "power-move",
  "behavioral-tell",
  "hidden-agenda",
  "narrative-shift",
  "insider-signal",
]);
export type GossipTellType = z.infer<typeof GossipTellTypeSchema>;

export const GossipFactSchema = z.object({
  text: z.string(),
  tell_type: GossipTellTypeSchema,
  tell_strength: z.number().min(0).max(1),
  subtext: z.string(),
  source_sentence: z.string(),
});
export type GossipFact = z.infer<typeof GossipFactSchema>;

export const GossipSurfaceReadingSchema = z.enum([
  "bullish-spin",
  "bearish-subtext",
  "neutral-surface",
  "mixed-signals",
]);
export type GossipSurfaceReading = z.infer<typeof GossipSurfaceReadingSchema>;

export const GossipSentimentSchema = z.object({
  surface_reading: GossipSurfaceReadingSchema.default("neutral-surface"),
  tell_strength: z.number().min(0).max(1),
  key_phrases: z.array(z.string()).default([]),
});
export type GossipSentiment = z.infer<typeof GossipSentimentSchema>;

export const GossipThemeSchema = z.object({
  label: z.string(),
  evidence: z.array(z.string()).default([]),
  narrative_hook: z.string(),
});
export type GossipTheme = z.infer<typeof GossipThemeSchema>;

// ---------------------------------------------------------------------------
// Union types — allow consuming code to handle either agent's output
// ---------------------------------------------------------------------------

export const AgentFactSchema = z.union([AnalystFactSchema, GossipFactSchema]);
export type AgentFact = z.infer<typeof AgentFactSchema>;

export const AgentSentimentSchema = z.union([
  AnalystSentimentSchema,
  GossipSentimentSchema,
]);
export type AgentSentiment = z.infer<typeof AgentSentimentSchema>;

export const AgentThemeSchema = z.union([
  AnalystThemeSchema,
  GossipThemeSchema,
]);
export type AgentTheme = z.infer<typeof AgentThemeSchema>;

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

export const AgentSummarySchema = z.object({
  summary: z.string(),
});

// ---------------------------------------------------------------------------
// AgentDebate — structured debate between Analyst and Gossip Girl
// ---------------------------------------------------------------------------

const clampToUnit = (val: unknown): number => {
  if (typeof val !== "number" || Number.isNaN(val)) return 0.5;
  if (val > 1 && val <= 100) return val / 100;
  return Math.min(1, Math.max(0, val));
};

const PositionSchema = z.object({
  claim: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  confidence: z.preprocess(clampToUnit, z.number().min(0).max(1)).default(0.5),
});

const GossipPositionSchema = z.object({
  claim: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  tellStrength: z.preprocess(clampToUnit, z.number().min(0).max(1)).default(0.5),
});

export const AgentDebateSchema = z.preprocess(
  (val) => {
    if (typeof val !== "object" || val === null) return val;
    const obj = val as Record<string, unknown>;
    
    // Normalize field name variations
    if (!obj.analystPosition && obj.analyst_position) {
      obj.analystPosition = obj.analyst_position;
    }
    if (!obj.gossipGirlPosition && obj.gossip_girl_position) {
      obj.gossipGirlPosition = obj.gossip_girl_position;
    }
    if (!obj.pointsOfAgreement && obj.points_of_agreement) {
      obj.pointsOfAgreement = obj.points_of_agreement;
    }
    if (!obj.pointsOfContention && obj.points_of_contention) {
      obj.pointsOfContention = obj.points_of_contention;
    }
    
    // Ensure positions are objects, not undefined
    if (!obj.analystPosition || typeof obj.analystPosition !== "object") {
      obj.analystPosition = {};
    }
    if (!obj.gossipGirlPosition || typeof obj.gossipGirlPosition !== "object") {
      obj.gossipGirlPosition = {};
    }
    
    // Normalize nested field names in positions
    const analystPos = obj.analystPosition as Record<string, unknown>;
    if (analystPos.confidence === undefined && analystPos.confidence_score !== undefined) {
      analystPos.confidence = analystPos.confidence_score;
    }
    
    const gossipPos = obj.gossipGirlPosition as Record<string, unknown>;
    if (gossipPos.tellStrength === undefined && gossipPos.tell_strength !== undefined) {
      gossipPos.tellStrength = gossipPos.tell_strength;
    }
    
    return obj;
  },
  z.object({
    analystPosition: PositionSchema,
    gossipGirlPosition: GossipPositionSchema,
    pointsOfAgreement: z.array(z.string()).default([]),
    pointsOfContention: z.array(z.object({
      topic: z.string().default(""),
      analystView: z.string().default(""),
      gossipGirlView: z.string().default(""),
      evidence: z.array(z.string()).default([]),
    })).default([]),
    synthesis: z.string().default("No synthesis available"),
  })
);
export type AgentDebate = z.infer<typeof AgentDebateSchema>;

// ---------------------------------------------------------------------------
// AgentAnalysis — top-level analysis result (union-based)
// ---------------------------------------------------------------------------

export interface AgentAnalysis {
  id: string;
  signalId: string;
  agentPersona: AgentPersona;
  summary: string;
  keyFacts: AnalystFact[] | GossipFact[];
  sentiment: AnalystSentiment | GossipSentiment;
  strategicThemes: AnalystTheme[] | GossipTheme[];
  confidence: number;
  crossReferences: Array<{
    analysisId: string;
    agentPersona: AgentPersona;
    connection: string;
  }> | null;
  modelUsed: string;
  analyzedAt: Date | string;
}

/**
 * Extract simple sentiment label from AgentAnalysis.
 * Handles both Analyst (direct sentiment field) and Gossip Girl (surface_reading mapping).
 */
export function extractSentimentLabel(analysis: AgentAnalysis): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  if (analysis.agentPersona === "ANALYST") {
    return (analysis.sentiment as AnalystSentiment).sentiment;
  }
  const surfaceReading = (analysis.sentiment as GossipSentiment).surface_reading;
  const mapping: Record<GossipSurfaceReading, "POSITIVE" | "NEGATIVE" | "NEUTRAL"> = {
    "bullish-spin": "POSITIVE",
    "bearish-subtext": "NEGATIVE",
    "neutral-surface": "NEUTRAL",
    "mixed-signals": "NEUTRAL",
  };
  return mapping[surfaceReading] ?? "NEUTRAL";
}

/**
 * Extract sentiment strength from AgentAnalysis.
 * Only Analyst sentiment includes strength; Gossip Girl does not.
 */
export function extractSentimentStrength(
  analysis: AgentAnalysis
): "STRONGLY" | "MILDY" | undefined {
  if (analysis.agentPersona === "ANALYST") {
    return (analysis.sentiment as AnalystSentiment).strength;
  }
  return undefined;
}
