/**
 * Types for the agent abstraction layer.
 * Defines agent personas and their analysis output shapes.
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
}

export const AgentFactSchema = z.object({
  text: z.string(),
  category: z.enum(["financial", "strategic", "operational", "personnel", "market"]),
  source_sentence: z.string(),
  confidence: z.number().min(0).max(1),
});
export type AgentFact = z.infer<typeof AgentFactSchema>;

export const AgentSentimentSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).default("NEUTRAL"),
  confidence: z.number().min(0).max(1),
  key_phrases: z.array(z.string()).default([]),
});

export const AgentThemeSchema = z.object({
  label: z.string(),
  evidence: z.array(z.string()).default([]),
  correlation_hints: z.array(z.string()).default([]),
});
export type AgentTheme = z.infer<typeof AgentThemeSchema>;

export const AgentSummarySchema = z.object({
  summary: z.string(),
});

export interface AgentAnalysis {
  id: string;
  signalId: string;
  agentPersona: AgentPersona;
  summary: string;
  keyFacts: Array<{
    text: string;
    category: string;
    confidence: number;
    sourceSentence?: string;
  }>;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  strategicThemes: Array<{
    label: string;
    evidence: string[];
    correlationHints?: string[];
  }>;
  confidence: number;
  crossReferences: Array<{
    analysisId: string;
    agentPersona: AgentPersona;
    connection: string;
  }> | null;
  modelUsed: string;
  analyzedAt: Date | string;
}
