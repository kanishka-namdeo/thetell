/**
 * Agent-specific prompt templates.
 * Wraps the base prompt patterns with agent voice and persona context.
 */

import type { AgentConfig } from "./types";
import type { LLMMessage } from "../types";

export function buildAgentFactExtractionPrompt(
  text: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Extract key facts from the provided text with the analytical lens of your persona.

For each fact, provide:
- text: A clear statement of the fact, written in your voice
- category: One of: financial, strategic, operational, personnel, market
- source_sentence: The exact sentence from the text that supports this fact
- confidence: Your confidence in this fact (0.0 to 1.0)

Respond with a JSON object with a "facts" array containing these objects.`,
    },
    {
      role: "user",
      content: `Extract key facts from this text:\n\n${text}`,
    },
  ];
}

export function buildAgentSentimentPrompt(
  text: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Analyze the corporate sentiment of the text through your unique perspective.

Provide:
- sentiment: One of: POSITIVE, NEGATIVE, NEUTRAL
- confidence: Your confidence in this classification (0.0 to 1.0)
- key_phrases: List of phrases that drive the sentiment, as filtered through your analytical lens

Respond with a JSON object containing these fields.`,
    },
    {
      role: "user",
      content: `Analyze the sentiment of this text:\n\n${text}`,
    },
  ];
}

export function buildAgentThemesPrompt(
  text: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Identify strategic themes in the text that matter from your perspective.

Common themes include: expansion, cost-cutting, M&A, leadership change, product launch, market entry, partnership, restructuring, innovation, competition.

For each theme, provide:
- label: The theme name
- evidence: List of text snippets supporting this theme
- correlation_hints: Suggestions for what other signals might correlate with this theme

Respond with a JSON object with a "themes" array.`,
    },
    {
      role: "user",
      content: `Identify strategic themes in this text:\n\n${text}`,
    },
  ];
}

export function buildAgentSummaryPrompt(
  text: string,
  companyName: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Generate a concise summary (2-3 sentences) of the key strategic implications of this text. Write in your distinctive voice and style.

Focus on what this reveals about the company's strategy, plans, or market position. Be specific and actionable.`,
    },
    {
      role: "user",
      content: `Summarize this text about ${companyName}:\n\n${text}`,
    },
  ];
}

export function buildAgentArticleHeadlinePrompt(
  companyName: string,
  summaries: string[],
  themes: string[],
  agentConfig: AgentConfig,
  crossRefAnalyses?: Array<{ summary: string; agentPersona: string }>
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");

  let crossRefSection = "";
  if (crossRefAnalyses && crossRefAnalyses.length > 0) {
    const crossRefText = crossRefAnalyses
      .map((a) => `- [${a.agentPersona}]: ${a.summary}`)
      .join("\n");
    crossRefSection = `\n\nCross-reference analyses from other agents:\n${crossRefText}`;
  }

  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Generate a compelling headline for a corporate intelligence article written in your voice and style.

The headline should be:
- Specific and informative
- Under 80 characters
- Focused on strategic implications
- Written in active voice
- Reflective of your unique perspective`,
    },
    {
      role: "user",
      content: `Company: ${companyName}
Strategic themes: ${themesStr}

Key findings:
${summariesText}${crossRefSection}

Generate a headline for this article.`,
    },
  ];
}

export function buildAgentArticleSummaryPrompt(
  companyName: string,
  headline: string,
  summaries: string[],
  themes: string[],
  agentConfig: AgentConfig,
  crossRefAnalyses?: Array<{ summary: string; agentPersona: string }>
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");

  let crossRefSection = "";
  if (crossRefAnalyses && crossRefAnalyses.length > 0) {
    const crossRefText = crossRefAnalyses
      .map((a) => `- [${a.agentPersona}]: ${a.summary}`)
      .join("\n");
    crossRefSection = `\n\nCross-reference analyses from other agents:\n${crossRefText}`;
  }

  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Write an executive summary (3-4 sentences) for a corporate intelligence article in your distinctive voice.

The summary should:
- Capture the key strategic insights
- Highlight the most significant findings
- Indicate potential implications
- Reflect your unique analytical perspective`,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Company: ${companyName}
Strategic themes: ${themesStr}

Key findings:
${summariesText}${crossRefSection}

Write an executive summary.`,
    },
  ];
}

export function buildAgentArticleBodyPrompt(
  companyName: string,
  headline: string,
  summary: string,
  analyses: Array<{ summary: string; facts: string[]; sentiment: string }>,
  agentConfig: AgentConfig,
  crossRefAnalyses?: Array<{ summary: string; agentPersona: string; keyFacts: string[] }>
): LLMMessage[] {
  const analysesText = analyses
    .map((a, i) => {
      const factsText = a.facts.map((f) => `- ${f}`).join("\n");
      return `### Analysis ${i + 1}\n${a.summary}\n\nKey facts:\n${factsText}\n\nSentiment: ${a.sentiment}`;
    })
    .join("\n\n");

  let crossRefSection = "";
  if (crossRefAnalyses && crossRefAnalyses.length > 0) {
    const crossRefText = crossRefAnalyses
      .map((a) => {
        const factsText = a.keyFacts.map((f) => `- ${f}`).join("\n");
        return `### [${a.agentPersona}] Analysis\n${a.summary}\n\nKey facts:\n${factsText}`;
      })
      .join("\n\n");
    crossRefSection = `\n\n## Cross-Reference Intelligence from Other Agents\n${crossRefText}`;
  }

  return [
    {
      role: "system",
      content: `${agentConfig.voice}

Write the body of a corporate intelligence article in markdown format, in your distinctive voice and style.

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

Write in your unique voice. Include specific data points and cite sources.`,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Executive Summary: ${summary}
Company: ${companyName}

Source analyses:
${analysesText}${crossRefSection}

Write the article body in markdown.`,
    },
  ];
}
