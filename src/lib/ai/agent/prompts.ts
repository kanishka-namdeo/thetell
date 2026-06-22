/**
 * Agent-specific prompt templates.
 * Each agent has completely different prompts tailored to their analytical lens.
 */

import type { AgentConfig } from "./types";
import type { LLMMessage, SourceType } from "../types";
import type { LocalSentimentResult } from "@/lib/nlp";
import { buildSystemPrefix, COMMON_WRITING_RULES } from "./writing-rules";

export function buildSourceContext(
  sourceType: SourceType,
  metadata?: { platform?: string; subreddit?: string; [key: string]: unknown } | null,
  engagement?: { score?: number; comments?: number; [key: string]: unknown } | null,
  persona?: "ANALYST" | "GOSSIP_GIRL"
): string {
  if (sourceType !== "SOCIAL") {
    return "";
  }

  const parts: string[] = [];

  if (metadata?.platform) {
    parts.push(`Platform: ${metadata.platform}`);
  }
  if (metadata?.subreddit) {
    parts.push(`Subreddit: ${metadata.subreddit}`);
  }

  const engagementParts: string[] = [];
  if (engagement?.score !== undefined) {
    engagementParts.push(`Score: ${engagement.score}`);
  }
  if (engagement?.comments !== undefined) {
    engagementParts.push(`Comments: ${engagement.comments}`);
  }
  if (engagementParts.length > 0) {
    parts.push(`Engagement: ${engagementParts.join(", ")}`);
  }

  if (parts.length === 0) {
    return "";
  }

  // Add persona-specific guidance
  let guidance = "";
  if (persona === "ANALYST") {
    guidance = "\n\nGuidance: Consider community sentiment and viral signals. High engagement indicates strong market interest or consensus.";
  } else if (persona === "GOSSIP_GIRL") {
    guidance = "\n\nGuidance: High engagement = strong community signal. Look for subtext, rumors, insider hints. What's the crowd really saying beneath the surface?";
  }

  return `\n\nSource Context:\n${parts.join("\n")}${guidance}`;
}

// =============================================================================
// ANALYST PROMPTS — Bloomberg Intelligence style, data-driven
// =============================================================================

export function buildAnalystFactExtractionPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  sourceContext?: string
): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve fact extraction accuracy.`
    : "";

  const sourceSection = sourceContext || "";

  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Extract verifiable data points, numbers, dates, and named sources from the provided text.${entitySection}${sourceSection}

For each fact, provide:
- text: A clear, precise statement of the fact with specific numbers, dates, or named entities
- category: One of: financial, strategic, operational, personnel, market
- source_sentence: The exact sentence from the text that supports this fact
- confidence: Your confidence in this fact (0.0 to 1.0) — higher for facts with specific data points

Focus on concrete, verifiable information. Prioritize:
- Specific numbers (revenue, growth rates, employee counts)
- Named sources (CEO, CFO, analysts)
- Dates and timelines
- Quantifiable metrics

Respond with a json object with a "facts" array containing these objects.`,
    },
    {
      role: "user",
      content: `Extract key facts from this text:\n\n${text}`,
    },
  ];
}

export function buildAnalystSentimentPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  localSentiment?: LocalSentimentResult | null,
  sourceContext?: string
): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}`
    : "";

  const localSentimentSection = localSentiment
    ? `\n\nLocal sentiment analysis: ${localSentiment.sentiment} (confidence: ${(localSentiment.confidence * 100).toFixed(1)}%)\n\nUse this as additional context, but apply your own judgment.`
    : "";

  const sourceSection = sourceContext || "";

  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Classify market sentiment — is this bullish, bearish, or neutral for the company?${entitySection}${localSentimentSection}${sourceSection}

IMPORTANT: Do not default to POSITIVE. Many announcements that sound positive on the surface carry negative implications, risks, or bearish undertones. Consider second-order effects, hidden costs, competitive threats, and what management is NOT saying. Err toward balanced or negative classification when signals are ambiguous.

Provide:
- sentiment: One of: POSITIVE, NEGATIVE, NEUTRAL
- strength: One of: STRONGLY, MILDY — how strong is the sentiment signal?
- confidence: Your confidence in this classification (0.0 to 1.0)
- key_phrases: List of phrases that drive the sentiment assessment

Examples of POSITIVE: Earnings beat expectations, revenue growth >10%, major partnership announced, market share increase, strong forward guidance
Examples of NEGATIVE: Earnings miss, layoffs, regulatory issues, revenue decline, leadership departure, lawsuit, margin compression, guidance cut
Examples of NEUTRAL: Routine announcements, incremental updates, maintenance releases, scheduled events, organizational housekeeping

Focus on market-moving information. Consider:
- Financial performance indicators (actual vs. expectations)
- Strategic announcements (costs, risks, competitive threats)
- Competitive positioning (market share shifts, new entrants)
- Forward-looking statements (guidance, outlook, cautionary language)
- Second-order effects (what does this imply for future quarters?)

Respond with a json object containing these fields.`,
    },
    {
      role: "user",
      content: `Analyze the market sentiment of this text:\n\n${text}`,
    },
  ];
}

export function buildAnalystThemesPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  sourceContext?: string
): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve theme identification accuracy.`
    : "";

  const sourceSection = sourceContext || "";

  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Identify strategic themes — what does this mean for the company's direction?${entitySection}${sourceSection}

Common themes include: expansion, cost-cutting, M&A, leadership change, product launch, market entry, partnership, restructuring, innovation, competition.

For each theme, provide:
- label: The theme name
- evidence: List of text snippets supporting this theme
- correlation_hints: Suggestions for what other signals might correlate with this theme

Focus on strategic implications for the company's trajectory. Consider:
- Market positioning shifts
- Resource allocation changes
- Competitive dynamics
- Long-term strategic direction

Respond with a json object with a "themes" array.`,
    },
    {
      role: "user",
      content: `Identify strategic themes in this text:\n\n${text}`,
    },
  ];
}

// =============================================================================
// GOSSIP GIRL PROMPTS — Page Six meets WSJ, entertainment-first
// =============================================================================

export function buildGossipGirlFactExtractionPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  sourceContext?: string
): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve tell detection accuracy.`
    : "";

  const sourceSection = sourceContext || "";

  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Find the tells — behavioral signals, power moves, hidden agendas, narrative shifts.${entitySection}${sourceSection}

For each tell, provide:
- text: A sharp, punchy statement of what caught your eye, written in your voice
- tell_type: One of: power-move, behavioral-tell, hidden-agenda, narrative-shift, insider-signal
- tell_strength: How strong is this tell? (0.0 to 1.0) — higher for obvious behavioral signals
- subtext: What are they NOT saying? What's the real story beneath the surface?
- source_sentence: The exact sentence from the text that reveals this tell

Focus on the drama beneath the corporate speak. Look for:
- Executive behavior (who left early, who's absent, who's speaking out of turn)
- Power dynamics (who's making decisions, who's being sidelined)
- Hidden agendas (what's not being said, what's being spun)
- Narrative shifts (how the story is being reframed)
- Insider signals (job postings that hint at secret projects, social posts that reveal rivalries)

Respond with a json object with a "facts" array containing these objects.`,
    },
    {
      role: "user",
      content: `Find the tells in this text:\n\n${text}`,
    },
  ];
}

export function buildGossipGirlSentimentPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  localSentiment?: LocalSentimentResult | null,
  sourceContext?: string
): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}`
    : "";

  const localSentimentSection = localSentiment
    ? `\n\nLocal sentiment analysis: ${localSentiment.sentiment} (confidence: ${(localSentiment.confidence * 100).toFixed(1)}%)\n\nUse this as additional context, but apply your own narrative judgment.`
    : "";

  const sourceSection = sourceContext || "";

  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Read the room — what's the surface story vs. the subtext? Don't just assume everything's rosy. Look for the cracks, the tensions, the stuff they're hiding. Most corporate announcements are spin jobs — your job is to see through it.${entitySection}${localSentimentSection}${sourceSection}

Provide:
- surface_reading: One of: bullish-spin, bearish-subtext, neutral-surface, mixed-signals
- tell_strength: How strong are the tells? (0.0 to 1.0) — higher for obvious subtext
- key_phrases: List of phrases that reveal the subtext

When to use each reading:
- bullish-spin: They're genuinely winning and the numbers prove it — real growth, real wins, no spin needed
- bearish-subtext: Looks fine on paper but something's off — the cracks are showing if you know where to look
- neutral-surface: Nothing to see here — routine housekeeping, scheduled moves, no drama
- mixed-signals: The surface says one thing, the subtext says another — contradictions and tensions abound (this is often the most honest reading)

Examples of bearish-subtext disguised as bullish-spin: "Strategic realignment" = layoffs coming. "Investing in growth" = burning cash. "Confident in our trajectory" = guidance was too aggressive. "Streamlining operations" = things aren't working.

Look beyond the official narrative. Consider:
- What's the spin vs. the reality?
- What are they not saying?
- What's the mood beneath the corporate speak?
- Are there mixed signals or contradictions?
- What would a skeptical short-seller read into this?

Respond with a json object containing these fields.`,
    },
    {
      role: "user",
      content: `Read the room in this text:\n\n${text}`,
    },
  ];
}

export function buildGossipGirlThemesPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  sourceContext?: string
): LLMMessage[] {
  const entitySection = entityContext
    ? `\n\nDetected entities: ${entityContext}\n\nUse these entities to improve drama detection accuracy.`
    : "";

  const sourceSection = sourceContext || "";

  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

What's the drama? Power plays, ego moves, succession whispers, culture cracks.${entitySection}${sourceSection}

For each theme, provide:
- label: The dramatic theme name (e.g., "Power Struggle", "Succession Drama", "Culture Clash")
- evidence: List of text snippets that reveal this drama
- narrative_hook: What's the compelling story here? What would make a great headline?

Focus on the human drama beneath the corporate announcements. Look for:
- Power plays and ego moves
- Succession whispers and leadership tensions
- Culture cracks and team dynamics
- Hidden rivalries and alliances
- The story they don't want you to see

Respond with a json object with a "themes" array.`,
    },
    {
      role: "user",
      content: `What's the drama in this text?\n\n${text}`,
    },
  ];
}

// =============================================================================
// DISPATCHER FUNCTIONS — route to agent-specific prompts based on persona
// =============================================================================

export function buildAgentFactExtractionPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  sourceContext?: string
): LLMMessage[] {
  if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlFactExtractionPrompt(text, agentConfig, entityContext, sourceContext);
  }
  return buildAnalystFactExtractionPrompt(text, agentConfig, entityContext, sourceContext);
}

export function buildAgentSentimentPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  localSentiment?: LocalSentimentResult | null,
  sourceContext?: string
): LLMMessage[] {
  if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlSentimentPrompt(text, agentConfig, entityContext, localSentiment, sourceContext);
  }
  return buildAnalystSentimentPrompt(text, agentConfig, entityContext, localSentiment, sourceContext);
}

export function buildAgentThemesPrompt(
  text: string,
  agentConfig: AgentConfig,
  entityContext?: string,
  sourceContext?: string
): LLMMessage[] {
  if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlThemesPrompt(text, agentConfig, entityContext, sourceContext);
  }
  return buildAnalystThemesPrompt(text, agentConfig, entityContext, sourceContext);
}

export function buildAnalystSummaryPrompt(
  text: string,
  companyName: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Generate a concise summary (2-3 sentences) of the key strategic implications of this text.

Focus on:
- Specific numbers, dates, and named sources
- Market-moving implications
- Actionable intelligence for investment professionals
- Forward-looking strategic direction

Write in your authoritative, data-driven style. Lead with the most strategically significant finding.

Respond with a json object containing a "summary" field.`,
    },
    {
      role: "user",
      content: `Summarize this text about ${companyName}:\n\n${text}`,
    },
  ];
}

export function buildGossipGirlSummaryPrompt(
  text: string,
  companyName: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  return [
    {
      role: "system",
      content: `${buildSystemPrefix(agentConfig.voice, agentConfig.forbiddenPhrases)}

Generate a punchy summary (2-3 sentences) that reveals the real story beneath the corporate speak.

Focus on:
- The tells and behavioral signals
- What they're not saying
- The human drama beneath the surface
- The compelling narrative hook

Write in your sharp, knowing style. Make it entertaining but grounded in evidence.

Respond with a json object containing a "summary" field.`,
    },
    {
      role: "user",
      content: `What's the real story here about ${companyName}?\n\n${text}`,
    },
  ];
}

export function buildAgentSummaryPrompt(
  text: string,
  companyName: string,
  agentConfig: AgentConfig
): LLMMessage[] {
  if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlSummaryPrompt(text, companyName, agentConfig);
  }
  return buildAnalystSummaryPrompt(text, companyName, agentConfig);
}

// ---------------------------------------------------------------------------
// Analyst article prompts — Bloomberg Intelligence style
// ---------------------------------------------------------------------------

export function buildAnalystArticleHeadlinePrompt(
  companyName: string,
  summaries: string[],
  themes: string[],
  socialContext?: string
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");
  const socialSection = socialContext ? `\n\n${socialContext}\n` : "";

  return [
    {
      role: "system",
      content: `You are a seasoned corporate intelligence analyst writing in the style of Bloomberg Intelligence or Reuters Deep Dive.

${COMMON_WRITING_RULES}

Generate a compelling headline for a corporate intelligence article.

The headline should be:
- Specific and data-driven — include numbers, dates, or named sources when possible
- Under 80 characters
- Focused on strategic implications and actionable intelligence
- Written in active voice
- Authoritative and precise — no speculation without evidence

Respond with a json object containing a "headline" field.`,
    },
    {
      role: "user",
      content: `Company: ${companyName}
Strategic themes: ${themesStr}
${socialSection}
Key findings:
${summariesText}

Generate a headline for this article.`,
    },
  ];
}

export function buildAnalystArticleSummaryPrompt(
  companyName: string,
  headline: string,
  summaries: string[],
  themes: string[],
  socialContext?: string
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");
  const socialSection = socialContext ? `\n\n${socialContext}\n` : "";

  return [
    {
      role: "system",
      content: `You are a seasoned corporate intelligence analyst writing in the style of Bloomberg Intelligence or Reuters Deep Dive.

${COMMON_WRITING_RULES}

Write an executive summary (3-4 sentences) for a corporate intelligence article.

The summary should:
- Lead with the most strategically significant finding
- Include specific data points, numbers, or named sources
- Highlight actionable intelligence for investment professionals
- Be precise and evidence-based — no flourishes or speculation

Respond with a json object containing a "summary" field.`,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Company: ${companyName}
Strategic themes: ${themesStr}
${socialSection}
Key findings:
${summariesText}

Write an executive summary.`,
    },
  ];
}

export function buildAnalystArticleBodyPrompt(
  companyName: string,
  headline: string,
  summary: string,
  analyses: Array<{ summary: string; facts: string[]; sentiment: string }>,
  agentConfig?: AgentConfig,
  socialContext?: string
): LLMMessage[] {
  const analysesText = analyses
    .map((a, i) => {
      const factsText = a.facts.map((f) => `- ${f}`).join("\n");
      return `### Analysis ${i + 1}\n${a.summary}\n\nKey facts:\n${factsText}\n\nSentiment: ${a.sentiment}`;
    })
    .join("\n\n");

  const socialSection = socialContext ? `\n\n${socialContext}\n` : "";

  let content = `You are a seasoned corporate intelligence analyst writing in the style of Bloomberg Intelligence or Reuters Deep Dive.

${COMMON_WRITING_RULES}

Write the body of a corporate intelligence article in markdown format.

Structure the article with these sections:
## Key Findings
## Evidence & Analysis
## Strategic Implications
## Outlook

Use markdown formatting:
- Headers (##, ###)
- Bullet points for data points and evidence
- Bold for emphasis on key numbers and dates
- Blockquotes for direct citations from sources
`;

  if (agentConfig?.structuralRules) {
    content += `\nStructural guidelines:\n`;
    if (agentConfig.structuralRules.sentenceLengthAvg) {
      content += `- Average sentence length: ~${agentConfig.structuralRules.sentenceLengthAvg} words\n`;
    }
    if (agentConfig.structuralRules.paragraphLengthMax) {
      content += `- Maximum paragraph length: ${agentConfig.structuralRules.paragraphLengthMax} sentences\n`;
    }
    content += `- Use active voice 80%+ of the time\n\n`;
  }

  content += `Write in an authoritative, precise, data-driven voice. Include specific data points, numbers, dates, and named sources. Every claim must be grounded in the source material. Use active voice. Lead with the most strategically significant finding.

Respond with a json object containing a "body" field.`;

  return [
    {
      role: "system",
      content,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Executive Summary: ${summary}
Company: ${companyName}
${socialSection}
Source analyses:
${analysesText}

Write the article body in markdown.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Gossip Girl article prompts — Page Six meets WSJ Heard on the Seat
// ---------------------------------------------------------------------------

export function buildGossipGirlArticleHeadlinePrompt(
  companyName: string,
  summaries: string[],
  themes: string[],
  socialContext?: string
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");
  const socialSection = socialContext ? `\n\n${socialContext}\n` : "";

  return [
    {
      role: "system",
      content: `You are a sharp-witted corporate insider columnist who writes like Page Six meets the Wall Street Journal's Heard on the Street.

${COMMON_WRITING_RULES}

Generate a compelling headline for a corporate intelligence article.

The headline should be:
- Witty and intriguing — hint at the subtext, the hidden story
- Under 80 characters
- Focused on the drama, the power moves, the tells
- Written with personality — short, punchy, knowing
- Entertainment-first — make readers want to click

Use only ASCII characters. Do not use Unicode symbols, non-English characters, or special typographic characters.

Respond with a json object containing a "headline" field.`,
    },
    {
      role: "user",
      content: `Company: ${companyName}
Strategic themes: ${themesStr}
${socialSection}
Key findings:
${summariesText}

Generate a headline for this article.`,
    },
  ];
}

export function buildGossipGirlArticleSummaryPrompt(
  companyName: string,
  headline: string,
  summaries: string[],
  themes: string[],
  socialContext?: string
): LLMMessage[] {
  const themesStr = themes.length > 0 ? themes.join(", ") : "none identified";
  const summariesText = summaries.map((s) => `- ${s}`).join("\n\n");
  const socialSection = socialContext ? `\n\n${socialContext}\n` : "";

  return [
    {
      role: "system",
      content: `You are a sharp-witted corporate insider columnist who writes like Page Six meets the Wall Street Journal's Heard on the Street.

${COMMON_WRITING_RULES}

Write an executive summary (3-4 sentences) for a corporate intelligence article.

The summary should:
- Hook the reader with the most intriguing tell or subtext
- Hint at what they're not saying, the hidden story behind the corporate speak
- Be entertaining and personality-driven — write like you're letting the reader in on a secret
- Ground the wit in real evidence — the gossip is in the data, not in fabrication

Use only ASCII characters. Do not use Unicode symbols, non-English characters, or special typographic characters.

Respond with a json object containing a "summary" field.`,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Company: ${companyName}
Strategic themes: ${themesStr}
${socialSection}
Key findings:
${summariesText}

Write an executive summary.`,
    },
  ];
}

export function buildGossipGirlArticleBodyPrompt(
  companyName: string,
  headline: string,
  summary: string,
  analyses: Array<{ summary: string; facts: string[]; sentiment: string }>,
  agentConfig?: AgentConfig,
  socialContext?: string
): LLMMessage[] {
  const analysesText = analyses
    .map((a, i) => {
      const factsText = a.facts.map((f) => `- ${f}`).join("\n");
      return `### Analysis ${i + 1}\n${a.summary}\n\nKey tells:\n${factsText}\n\nSurface reading: ${a.sentiment}`;
    })
    .join("\n\n");

  const socialSection = socialContext ? `\n\n${socialContext}\n` : "";

  let content = `You are a sharp-witted corporate insider columnist who writes like Page Six meets the Wall Street Journal's Heard on the Street.

${COMMON_WRITING_RULES}

Write the body of a corporate intelligence article in markdown format.

Structure the article with these sections:
## The Tell
(What caught her eye — the hook, the most intriguing behavioral signal or power move)

## Reading Between the Lines
(The subtext, the hidden story — what the data implies beneath the surface)

## The Subtext
(What they're not saying, what the patterns reveal about the real story)

## What They're Not Saying
(The punchline — the real story behind the corporate speak, the knowing aside)

Use markdown formatting:
- Headers (##, ###)
- Bullet points for tells and evidence
- Bold for emphasis on key reveals
- Blockquotes for direct citations with a knowing tone
- Short, punchy sentences with occasional asides in parentheses
`;

  if (agentConfig?.structuralRules) {
    content += `\nStructural guidelines:\n`;
    if (agentConfig.structuralRules.sentenceLengthAvg) {
      content += `- Average sentence length: ~${agentConfig.structuralRules.sentenceLengthAvg} words (shorter, punchier)\n`;
    }
    if (agentConfig.structuralRules.paragraphLengthMax) {
      content += `- Maximum paragraph length: ${agentConfig.structuralRules.paragraphLengthMax} sentences\n`;
    }
    content += `- Use parenthetical asides 2-3 times per article\n- Use metaphors 1-2 times per section\n\n`;
  }

  content += `Write in a knowing, slightly sardonic, entertaining voice. Spot the tells others miss. Write in short, punchy sentences with occasional asides in parentheses. Love a good metaphor. Never mean, but never boring. Always ground the wit in real evidence — the gossip is in the data, not in fabrication.

Use only ASCII characters. Do not use Unicode symbols, non-English characters, or special typographic characters.

Respond with a json object containing a "body" field.`;

  return [
    {
      role: "system",
      content,
    },
    {
      role: "user",
      content: `Headline: ${headline}
Executive Summary: ${summary}
Company: ${companyName}
${socialSection}
Source analyses:
${analysesText}

Write the article body in markdown.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Dispatch wrappers — route to agent-specific prompts based on persona
// ---------------------------------------------------------------------------

export function buildAgentArticleHeadlinePrompt(
  companyName: string,
  summaries: string[],
  themes: string[],
  agentConfig: AgentConfig,
  socialContext?: string
): LLMMessage[] {
  if (agentConfig.persona === "ANALYST") {
    return buildAnalystArticleHeadlinePrompt(companyName, summaries, themes, socialContext);
  } else if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlArticleHeadlinePrompt(companyName, summaries, themes, socialContext);
  }
  throw new Error(`Unknown agent persona: ${agentConfig.persona}`);
}

export function buildAgentArticleSummaryPrompt(
  companyName: string,
  headline: string,
  summaries: string[],
  themes: string[],
  agentConfig: AgentConfig,
  socialContext?: string
): LLMMessage[] {
  if (agentConfig.persona === "ANALYST") {
    return buildAnalystArticleSummaryPrompt(companyName, headline, summaries, themes, socialContext);
  } else if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlArticleSummaryPrompt(companyName, headline, summaries, themes, socialContext);
  }
  throw new Error(`Unknown agent persona: ${agentConfig.persona}`);
}

export function buildAgentArticleBodyPrompt(
  companyName: string,
  headline: string,
  summary: string,
  analyses: Array<{ summary: string; facts: string[]; sentiment: string }>,
  agentConfig: AgentConfig,
  socialContext?: string
): LLMMessage[] {
  if (agentConfig.persona === "ANALYST") {
    return buildAnalystArticleBodyPrompt(companyName, headline, summary, analyses, agentConfig, socialContext);
  } else if (agentConfig.persona === "GOSSIP_GIRL") {
    return buildGossipGirlArticleBodyPrompt(companyName, headline, summary, analyses, agentConfig, socialContext);
  }
  throw new Error(`Unknown agent persona: ${agentConfig.persona}`);
}

// ---------------------------------------------------------------------------
// Debate prompt — structured debate between Analyst and Gossip Girl
// ---------------------------------------------------------------------------

export function buildDebatePrompt(
  analystAnalysis: { summary: string; keyFacts: string[]; strategicThemes: string[] },
  gossipGirlAnalysis: { summary: string; keyFacts: string[]; strategicThemes: string[] }
): LLMMessage[] {
  const analystFactsText = analystAnalysis.keyFacts.map((f) => `- ${f}`).join("\n");
  const analystThemesText = analystAnalysis.strategicThemes.map((t) => `- ${t}`).join("\n");
  const gossipFactsText = gossipGirlAnalysis.keyFacts.map((f) => `- ${f}`).join("\n");
  const gossipThemesText = gossipGirlAnalysis.strategicThemes.map((t) => `- ${t}`).join("\n");

  return [
    {
      role: "system",
      content: `You are a corporate intelligence moderator facilitating a structured debate between two analysts with different perspectives on the same signal.

${COMMON_WRITING_RULES}

**Analyst** (data-driven, Bloomberg Intelligence style):
- Summary: ${analystAnalysis.summary}
- Key facts: ${analystFactsText || "none"}
- Strategic themes: ${analystThemesText || "none"}

**Gossip Girl** (Page Six meets WSJ, entertainment-first):
- Summary: ${gossipGirlAnalysis.summary}
- Key tells: ${gossipFactsText || "none"}
- Dramatic themes: ${gossipThemesText || "none"}

Your task is to synthesize these two perspectives into a structured debate.

You MUST respond with a JSON object with EXACTLY these fields:
{
  "analystPosition": {
    "claim": "string - the analyst's main conclusion",
    "evidence": ["string array of supporting evidence points"],
    "confidence": 0.75
  },
  "gossipGirlPosition": {
    "claim": "string - the gossip girl's main conclusion",
    "evidence": ["string array of supporting tells"],
    "tellStrength": 0.80
  },
  "pointsOfAgreement": ["string array of points where both agree"],
  "pointsOfContention": [
    {
      "topic": "string",
      "analystView": "string",
      "gossipGirlView": "string",
      "evidence": ["string array"]
    }
  ],
  "synthesis": "string - balanced conclusion incorporating both perspectives"
}

Important rules:
- confidence and tellStrength must be numbers between 0.0 and 1.0
- All array fields must be arrays even if empty []
- The top-level keys MUST be exactly: analystPosition, gossipGirlPosition, pointsOfAgreement, pointsOfContention, synthesis
- Respond ONLY with the JSON object, no extra text`,
    },
    {
      role: "user",
      content: `Synthesize these two perspectives into a structured debate.`,
    },
  ];
}
