/**
 * Prompt templates for LLM analysis tasks.
 * Translated from backend/app/llm/prompts.py
 */

import type { LLMMessage } from "./types";
import type { ExtractedEntities } from "@/lib/nlp";
import type { LocalSentimentResult } from "@/lib/nlp";

export function buildFactExtractionPrompt(text: string, entityContext?: string): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve fact extraction accuracy.`
    : "";

  return [
    {
      role: "system",
      content: `You are an expert corporate intelligence analyst. Extract key facts from the provided text.${entitySection}

For each fact, provide:
- text: A clear statement of the fact
- category: One of: financial, strategic, operational, personnel, market
- source_sentence: The exact sentence from the text that supports this fact
- confidence: Your confidence in this fact (0.0 to 1.0)

Respond with a json object with a "facts" array containing these objects.`,
    },
    {
      role: "user",
      content: `Extract key facts from this text:\n\n${text}`,
    },
  ];
}

export function buildSentimentPrompt(text: string, entityContext?: string): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve sentiment analysis accuracy.`
    : "";

  return [
    {
      role: "system",
      content: `You are an expert at analyzing corporate sentiment. Classify the overall sentiment of the text.${entitySection}

Provide:
- sentiment: One of: POSITIVE, NEGATIVE, NEUTRAL
- confidence: Your confidence in this classification (0.0 to 1.0)
- key_phrases: List of phrases that drive the sentiment

Respond with a json object containing these fields.`,
    },
    {
      role: "user",
      content: `Analyze the sentiment of this text:\n\n${text}`,
    },
  ];
}

export function buildThemesPrompt(text: string, entityContext?: string): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve theme identification accuracy.`
    : "";

  return [
    {
      role: "system",
      content: `You are a corporate strategy analyst. Identify strategic themes in the text.${entitySection}

Common themes include: expansion, cost-cutting, M&A, leadership change, product launch, market entry, partnership, restructuring, innovation, competition.

For each theme, provide:
- label: The theme name
- evidence: List of text snippets supporting this theme
- correlation_hints: Suggestions for what other signals might correlate with this theme

Respond with a json object with a "themes" array.`,
    },
    {
      role: "user",
      content: `Identify strategic themes in this text:\n\n${text}`,
    },
  ];
}

export function buildSummaryPrompt(
  text: string,
  companyName: string
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `You are a corporate intelligence analyst. Generate a concise summary (2-3 sentences) of the key strategic implications of this text.

Focus on what this reveals about the company's strategy, plans, or market position. Be specific and actionable.

Respond with a json object containing a "summary" field.`,
    },
    {
      role: "user",
      content: `Summarize this text about ${companyName}:\n\n${text}`,
    },
  ];
}

export function buildArticleHeadlinePrompt(
  companyName: string,
  summaries: string[],
  themes: string[]
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");

  return [
    {
      role: "system",
      content: `You are a business journalist. Generate a compelling headline for a corporate intelligence article.

The headline should be:
- Specific and informative
- Under 80 characters
- Focused on strategic implications
- Written in active voice`,
    },
    {
      role: "user",
      content: `Company: ${companyName}
Strategic themes: ${themesStr}

Key findings:
${summariesText}

Generate a headline for this article.`,
    },
  ];
}

export function buildArticleSummaryPrompt(
  companyName: string,
  headline: string,
  summaries: string[],
  themes: string[]
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");

  return [
    {
      role: "system",
      content: `You are a business journalist. Write an executive summary (3-4 sentences) for a corporate intelligence article.

The summary should:
- Capture the key strategic insights
- Highlight the most significant findings
- Indicate potential implications
- Be written in a professional, analytical tone`,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Company: ${companyName}
Strategic themes: ${themesStr}

Key findings:
${summariesText}

Write an executive summary.`,
    },
  ];
}

export function buildArticleBodyPrompt(
  companyName: string,
  headline: string,
  summary: string,
  analyses: Array<{ summary: string; facts: string[]; sentiment: string }>
): LLMMessage[] {
  const analysesText = analyses
    .map((a, i) => {
      const factsText = a.facts.map((f) => `- ${f}`).join("\n");
      return `### Analysis ${i + 1}\n${a.summary}\n\nKey facts:\n${factsText}\n\nSentiment: ${a.sentiment}`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content: `You are a business journalist. Write the body of a corporate intelligence article in markdown format.

Structure the article with these sections:
## Key Findings
## Evidence & Analysis
## Strategic Implications
## Outlook

Use markdown formatting:
- Headers (##, ###)
- Bullet points
- Bold for emphasis
- Blockquotes for direct citations

Write in a professional, analytical tone. Include specific data points and cite sources.`,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Executive Summary: ${summary}
Company: ${companyName}

Source analyses:
${analysesText}

Write the article body in markdown.`,
    },
  ];
}
