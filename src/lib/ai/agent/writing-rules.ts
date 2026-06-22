/**
 * Common anti-AI writing rules shared across all agent personas.
 * These rules target patterns that make writing sound AI-generated,
 * without suppressing persona-specific personality.
 */

/**
 * Common forbidden phrases that sound AI-generated.
 * These are merged with per-persona forbidden phrases at prompt time.
 */
export const COMMON_FORBIDDEN_PATTERNS: string[] = [
  // Formulaic transitions
  "in conclusion",
  "in summary",
  "to summarize",
  "it's worth noting",
  "it should be noted",
  "it's important to note",
  "it's important to consider",
  "it's worth considering",
  
  // AI-typical filler phrases
  "in the realm of",
  "navigating the landscape",
  "navigating the complexities",
  "a testament to",
  "at the end of the day",
  "moving forward",
  "when it comes to",
  "in today's",
  "as we look at",
  "as we examine",
  "let's dive in",
  "let's explore",
  "let's delve",
  
  // Self-referential phrases
  "this article",
  "this analysis",
  "this report",
  "in this article",
  "in this analysis",
  "in this report",
  
  // Overused corporate/AI adjectives
  "robust",
  "seamless",
  "holistic",
  "comprehensive",
  "cutting-edge",
  "world-class",
  "best-in-class",
  "industry-leading",
  "state-of-the-art",
  "next-generation",
  
  // Hedging and false balance
  "on the other hand",
  "while it's important to consider",
  "while we must consider",
  "it's important to balance",
  "both sides have merit",
  "there are valid points on both sides",
];

/**
 * Common writing rules injected into every system prompt.
 * These target structural and tonal anti-patterns without suppressing personality.
 */
export const COMMON_WRITING_RULES = `
## Writing Style Rules (Apply to All Personas)

**Banned phrases**: Never use these: ${COMMON_FORBIDDEN_PATTERNS.join(", ")}

**Structural anti-patterns to avoid**:
- No formulaic transition words at every paragraph start ("Furthermore", "Moreover", "Additionally", "However")
- No triple-parallel lists where prose would work (avoid groups of exactly 3 items unless structurally required)
- No restating the question before answering
- No "Let's dive in", "Let's explore", or similar filler openers
- Vary sentence length — mix short punchy sentences with longer analytical ones
- No concluding summary paragraph that restates everything (except where structurally required by the output format)

**Tone anti-patterns to avoid**:
- No false balance or both-sides-ism when evidence clearly points one direction
- No hedging every claim with "while it's important to consider"
- No generic filler that adds no information
- Be direct — state the finding, then support it

**What these rules preserve**:
- Your distinct voice and personality remain intact
- Your analytical style and perspective are unchanged
- These rules remove AI artifacts, not human voice
`;

/**
 * Builds the system prompt prefix by composing voice, forbidden phrases, and common writing rules.
 * This is the single injection point for all shared writing guidance.
 *
 * @param voice - The persona's voice string (personality)
 * @param forbiddenPhrases - Per-persona forbidden phrases (optional)
 * @returns Complete system prompt prefix with voice + forbidden phrases + common rules
 */
export function buildSystemPrefix(
  voice: string,
  forbiddenPhrases?: string[]
): string {
  const allForbidden = [
    ...(forbiddenPhrases || []),
    ...COMMON_FORBIDDEN_PATTERNS,
  ];
  
  const uniqueForbidden = Array.from(new Set(allForbidden));
  
  return `${voice}

Avoid these phrases entirely: ${uniqueForbidden.join(", ")}

${COMMON_WRITING_RULES}`;
}
