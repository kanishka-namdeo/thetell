# Agent Abstraction Layer

The agent abstraction layer provides a framework for running AI analyses with distinct personas. Each agent has its own voice, source preferences, and analytical style, allowing the same signal to be analyzed from multiple perspectives.

## Overview

The system currently supports two agent personas:

- **The Analyst**: Authoritative, data-driven analysis in Bloomberg Intelligence style
- **The Gossip Girl**: Sharp-witted, entertaining analysis with Page Six flair

Both agents analyze the same signals independently, producing articles in their distinct voices. Agents can cross-reference each other's work to build multi-perspective intelligence.

## Architecture

```
src/lib/ai/agent/
├── types.ts              # Core interfaces and Zod schemas
├── personas.ts           # Agent persona configurations
├── prompts.ts            # Prompt builders with agent voice injection
├── pipeline.ts           # Analysis pipeline with agent-specific prompts
└── article-generator.ts  # Article generation in agent voice
```

## Core Concepts

### AgentConfig Interface

Every agent persona is defined by an `AgentConfig`:

```typescript
interface AgentConfig {
  persona: AgentPersona;        // "ANALYST" | "GOSSIP_GIRL"
  name: string;                 // Display name
  voice: string;                // System prompt defining the agent's writing style
  sourcePreferences: string[];  // Preferred signal sources
  canCrossReference: boolean;   // Can reference other agents' analyses
  temperature: number;          // LLM temperature (0.0-1.0)
}
```

### AgentAnalysis Output

The analysis pipeline returns an `AgentAnalysis` object with **union types** that vary by agent persona:

```typescript
interface AgentAnalysis {
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
```

#### Analyst Output Shape

The Analyst produces data-driven, category-based analysis:

```typescript
// Analyst facts
interface AnalystFact {
  text: string;
  category: "financial" | "strategic" | "operational" | "personnel" | "market";
  source_sentence: string;
  confidence: number; // 0.0-1.0
}

// Analyst sentiment
interface AnalystSentiment {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  confidence: number; // 0.0-1.0
  key_phrases: string[];
}

// Analyst themes
interface AnalystTheme {
  label: string;
  evidence: string[];
  correlation_hints: string[];
}
```

#### Gossip Girl Output Shape

Gossip Girl produces narrative-driven, tell-based analysis:

```typescript
// Gossip Girl facts
interface GossipFact {
  text: string;
  tell_type: "power-move" | "behavioral-tell" | "hidden-agenda" | "narrative-shift" | "insider-signal";
  tell_strength: number; // 0.0-1.0
  subtext: string;
  source_sentence: string;
}

// Gossip Girl sentiment
interface GossipSentiment {
  surface_reading: "bullish-spin" | "bearish-subtext" | "neutral-surface" | "mixed-signals";
  tell_strength: number; // 0.0-1.0
  key_phrases: string[];
}

// Gossip Girl themes
interface GossipTheme {
  label: string;
  evidence: string[];
  narrative_hook: string;
}
```

#### Type Guards for Union Handling

When consuming `AgentAnalysis` in UI components, use type guards to safely handle the union types:

```typescript
// Type guards for facts
function isAnalystFact(fact: unknown): fact is AnalystFact {
  return fact !== null && typeof fact === "object" && "category" in fact;
}

function isGossipFact(fact: unknown): fact is GossipFact {
  return fact !== null && typeof fact === "object" && "tell_type" in fact;
}

// Type guards for themes
function isAnalystTheme(theme: unknown): theme is AnalystTheme {
  return theme !== null && typeof theme === "object" && "correlation_hints" in theme;
}

function isGossipTheme(theme: unknown): theme is GossipTheme {
  return theme !== null && typeof theme === "object" && "narrative_hook" in theme;
}

// Usage in components
{analysis.keyFacts.map((fact) => (
  isAnalystFact(fact) ? (
    <div>Category: {fact.category}</div>
  ) : isGossipFact(fact) ? (
    <div>Tell: {fact.tell_type} - {fact.subtext}</div>
  ) : null
))}
```

## Usage

### Analyzing a Signal with an Agent

```typescript
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { ANALYST_CONFIG } from "@/lib/ai/agent/personas";

const signal = {
  id: "signal-123",
  sourceUrl: "https://example.com/article",
  sourceType: "NEWS",
  title: "Company X Reports Record Revenue",
  rawContent: "Full article text...",
  publishedAt: new Date(),
  scrapedAt: new Date(),
  companyId: "company-456",
  status: "scraped",
  company: {
    id: "company-456",
    name: "Company X",
    slug: "company-x",
    ticker: "CXX",
  },
};

const analysis = await analyzeSignalWithAgent(
  signal,
  ANALYST_CONFIG,
  undefined,  // crossRefAnalyses (optional)
  "openai",   // provider
  "gpt-4o"    // model (optional)
);

console.log(analysis.summary);
console.log(analysis.keyFacts);
console.log(analysis.sentiment);
```

### Generating an Article with an Agent

```typescript
import { generateArticleWithAgent } from "@/lib/ai/agent/article-generator";
import { GOSSIP_GIRL_CONFIG } from "@/lib/ai/agent/personas";

const input = {
  companyId: "company-456",
  companyName: "Company X",
  analyses: [
    {
      summary: "Company X reported 20% revenue growth...",
      keyFacts: [{ text: "Revenue up 20% YoY" }],
      sentiment: "POSITIVE",
      strategicThemes: [{ label: "Growth" }],
    },
  ],
};

const article = await generateArticleWithAgent(
  input,
  GOSSIP_GIRL_CONFIG,
  undefined,  // crossRefAnalyses (optional)
  "anthropic", // provider
  "claude-3-5-sonnet"  // model (optional)
);

console.log(article.title);
console.log(article.summary);
console.log(article.body);
```

### Cross-Referencing Between Agents

Agents can reference each other's analyses to build richer intelligence:

```typescript
// First, analyze with The Analyst
const analystAnalysis = await analyzeSignalWithAgent(
  signal,
  ANALYST_CONFIG
);

// Then, analyze with The Gossip Girl, cross-referencing The Analyst's work
const gossipAnalysis = await analyzeSignalWithAgent(
  signal,
  GOSSIP_GIRL_CONFIG,
  [analystAnalysis]  // Pass The Analyst's analysis
);

// The Gossip Girl's analysis will now include references to The Analyst's findings
console.log(gossipAnalysis.crossReferences);
// [{ analysisId: "...", agentPersona: "ANALYST", connection: "..." }]
```

## Adding a New Agent Persona

To add a new agent persona:

### 1. Define the Persona Type

In `types.ts`, add the new persona to the `AgentPersona` union:

```typescript
export type AgentPersona = "ANALYST" | "GOSSIP_GIRL" | "YOUR_NEW_PERSONA";
```

### 2. Create the Configuration

In `personas.ts`, create a new config:

```typescript
export const YOUR_NEW_CONFIG: AgentConfig = {
  persona: "YOUR_NEW_PERSONA",
  name: "Your Agent Name",
  voice: `You are a [description of your agent's voice and style].
  
  Your tone is [specific characteristics].
  You favor [what you focus on].
  Your prose is [writing style].
  You write for [target audience].
  
  Always [key behaviors]. Never [things to avoid].`,
  sourcePreferences: ["NEWS", "SOCIAL"],  // Preferred sources
  canCrossReference: true,
  temperature: 0.6,  // Adjust for creativity vs. conservatism
};
```

### 3. Register the Configuration

Add to the `AGENT_CONFIGS` map:

```typescript
export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  ANALYST: ANALYST_CONFIG,
  GOSSIP_GIRL: GOSSIP_GIRL_CONFIG,
  YOUR_NEW_PERSONA: YOUR_NEW_CONFIG,
};
```

### 4. Use the New Agent

```typescript
import { YOUR_NEW_CONFIG } from "@/lib/ai/agent/personas";

const analysis = await analyzeSignalWithAgent(
  signal,
  YOUR_NEW_CONFIG
);
```

## Prompt Builders

The `prompts.ts` module provides functions that inject agent voice into prompts:

### Analysis Prompts

- `buildAgentFactExtractionPrompt(text, agentConfig)` - Extract facts with agent voice
- `buildAgentSentimentPrompt(text, agentConfig)` - Classify sentiment with agent perspective
- `buildAgentThemesPrompt(text, agentConfig)` - Identify themes with agent lens
- `buildAgentSummaryPrompt(text, companyName, agentConfig)` - Generate summary in agent voice

### Article Generation Prompts

- `buildAgentArticleHeadlinePrompt(companyName, summaries, themes, agentConfig, crossRefAnalyses?)` - Generate headline
- `buildAgentArticleSummaryPrompt(companyName, headline, summaries, themes, agentConfig, crossRefAnalyses?)` - Generate executive summary
- `buildAgentArticleBodyPrompt(companyName, headline, summary, analyses, agentConfig, crossRefAnalyses?)` - Generate article body

All prompt builders accept an optional `crossRefAnalyses` parameter to include other agents' perspectives.

## Pipeline Flow

### Analysis Pipeline

```
analyzeSignalWithAgent()
  ↓
1. Parallel execution:
   - extractFactsWithPrompt() with agent voice
   - classifySentimentWithPrompt() with agent flavor
   - identifyThemesWithPrompt() with agent perspective
  ↓
2. Sequential:
   - generateSummary() with agent voice
   - calculateConfidence() based on all results
   - buildCrossReferences() if other analyses provided
  ↓
3. Return AgentAnalysis
```

### Article Generation Pipeline

```
generateArticleWithAgent()
  ↓
1. generateHeadline() with agent voice
  ↓
2. generateSummary() with agent voice
  ↓
3. generateBody() with agent voice
  ↓
4. createSlug() from headline
  ↓
5. Return AgentArticleResult
```

## Best Practices

### Voice Design

- Be specific about tone, style, and audience
- Include concrete examples of what the agent should and shouldn't do
- Ground the voice in real-world analogies (e.g., "writes like Bloomberg Intelligence")
- Test the voice with sample content to ensure it produces distinct output

### Temperature Selection

- **0.3-0.5**: Conservative, factual analysis (The Analyst)
- **0.6-0.7**: Balanced creativity and accuracy (The Gossip Girl)
- **0.8+**: Highly creative, experimental voices

### Cross-Referencing

- Use cross-referencing to build multi-perspective intelligence
- Pass earlier analyses to later agents for richer context
- Cross-references appear in the article body as "Cross-Reference Intelligence from Other Agents"

### Error Handling

Both `analyzeSignalWithAgent()` and `generateArticleWithAgent()` throw errors on failure. Wrap calls in try-catch:

```typescript
try {
  const analysis = await analyzeSignalWithAgent(signal, ANALYST_CONFIG);
} catch (error) {
  logger.error("Agent analysis failed", { error: String(error) });
  // Handle error
}
```

## Testing

Mock the LLM provider for testing:

```typescript
import { vi } from "vitest";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";

vi.mock("@/lib/ai/provider", () => ({
  getProvider: () => ({
    completeStructured: vi.fn().mockResolvedValue({
      facts: [{ text: "Test fact", category: "strategic", confidence: 0.9 }],
      sentiment: "POSITIVE",
      themes: [{ label: "Growth" }],
      summary: "Test summary",
    }),
  }),
}));

const analysis = await analyzeSignalWithAgent(signal, ANALYST_CONFIG);
expect(analysis.summary).toBe("Test summary");
```

## Debate Generation (Planned)

The debate feature will allow agents to engage in structured dialogue about signals, with each agent presenting their perspective and responding to the other's analysis.

**Current Status**: UI placeholders exist in signal detail pages (`signal-detail-content.tsx` and dashboard `signals/[id]/page.tsx`), but the underlying debate generation logic is not yet implemented.

**Planned Architecture**:
- `AgentDebate` model to store debate threads between agents
- `generateDebate()` function to orchestrate multi-turn agent dialogue
- Each debate round will include agent responses, counterpoints, and synthesis

This feature builds on the existing cross-referencing capability, where agents can already reference each other's analyses.

## Future Extensions

- **Additional personas**: Industry-specific analysts, contrarian voices, technical experts
- **Dynamic voice tuning**: Adjust voice parameters based on signal type or user preferences
- **Multi-language support**: Agents that analyze in different languages
- **Custom personas**: User-defined agent configurations
