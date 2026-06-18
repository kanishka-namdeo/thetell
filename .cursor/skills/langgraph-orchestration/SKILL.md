---
name: langgraph-orchestration
description: Use when building multi-step LLM workflows, implementing state machines, cross-signal inference, or article generation pipelines with LangGraph.js in TypeScript
---

# LangGraph Orchestration

## Overview

LangGraph.js provides explicit control over multi-step LLM workflows through a state machine model. Unlike simple chain-of-thought prompting, LangGraph gives you:

- **Nodes** — async TypeScript functions that process and return partial state
- **Edges** — deterministic or conditional transitions between nodes
- **State** — a TypeScript interface that flows through the graph
- **Checkpointing** — crash recovery via PostgreSQL (reuses existing `DATABASE_URL`)
- **Interrupts** — human-in-the-loop pauses for analyst review
- **Streaming** — token-level and node-level real-time updates to the frontend

## When to Use

- Building the signal analysis pipeline (extract → classify → infer → score)
- Implementing cross-signal inference across multiple companies or time periods
- Creating article generation workflows with editorial review steps
- Any workflow that needs crash recovery, retries, or human approval gates
- When you need conditional routing based on intermediate results

## Core Patterns

### State Definition

Use TypeScript interfaces with explicit field types. Every field should be clearly typed.

```typescript
// src/lib/agent/types.ts
interface Fact {
  statement: string;
  confidence: number;
  sourceUrl: string;
}

interface SignalAnalysisState {
  // Input
  signalId: string;
  rawText: string;
  companyId: string;
  // Intermediate
  facts: Fact[];
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  themes: string[];
  // Output
  confidenceScore: number;
  summary: string;
  // Control
  error: string | null;
}
```

### Node Functions

Nodes are async functions that return partial state objects. Never mutate state directly.

```typescript
import { getProvider } from "@/lib/ai/provider";

async function extractFacts(state: SignalAnalysisState): Promise<Partial<SignalAnalysisState>> {
  const provider = getProvider("openai");
  const prompt = `Extract key facts from:\n${state.rawText}`;
  
  const response = await provider.completeStructured(
    [{ role: "user", content: prompt }],
    FactListSchema,
  );
  
  return { facts: response.facts };
}

async function classifySentiment(state: SignalAnalysisState): Promise<Partial<SignalAnalysisState>> {
  const provider = getProvider("openai");
  const factsText = state.facts.map(f => f.statement).join("\n");
  const prompt = `Classify sentiment as positive/negative/neutral:\n${factsText}`;
  
  const result = await provider.completeStructured(
    [{ role: "user", content: prompt }],
    SentimentSchema,
  );
  
  return { sentiment: result.sentiment };
}
```

### Graph Compilation

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";

const graph = new StateGraph<SignalAnalysisState>({
  channels: {
    signalId: { value: (x, y) => y ?? x },
    rawText: { value: (x, y) => y ?? x },
    companyId: { value: (x, y) => y ?? x },
    facts: { value: (x, y) => y ?? x },
    sentiment: { value: (x, y) => y ?? x },
    themes: { value: (x, y) => y ?? x },
    confidenceScore: { value: (x, y) => y ?? x },
    summary: { value: (x, y) => y ?? x },
    error: { value: (x, y) => y ?? x },
  },
});

graph.addNode("extract_facts", extractFacts);
graph.addNode("classify_sentiment", classifySentiment);
graph.addNode("identify_themes", identifyThemes);
graph.addNode("score_confidence", scoreConfidence);
graph.addNode("generate_summary", generateSummary);

graph.addEdge(START, "extract_facts");
graph.addEdge("extract_facts", "classify_sentiment");
graph.addEdge("classify_sentiment", "identify_themes");
graph.addEdge("identify_themes", "score_confidence");
graph.addEdge("score_confidence", "generate_summary");
graph.addEdge("generate_summary", END);

const app = graph.compile();
```

### Conditional Routing

Use `addConditionalEdges()` with a pure router function — no side effects.

```typescript
function routeByConfidence(state: SignalAnalysisState): string {
  if (state.error) {
    return "dead_letter";
  }
  if (state.confidenceScore >= 0.8) {
    return "publish";
  }
  return "review";
}

graph.addConditionalEdges("score_confidence", routeByConfidence, {
  publish: "generate_summary",
  review: "analyst_review",
  dead_letter: "failed_analysis",
});
```

### Interrupts (Human-in-the-Loop)

Pause execution for analyst review before publishing high-impact inferences.

```typescript
import { interrupt } from "@langchain/langgraph";

async function analystReview(state: SignalAnalysisState): Promise<Partial<SignalAnalysisState>> {
  const decision = await interrupt({
    signalId: state.signalId,
    summary: state.summary,
    confidence: state.confidenceScore,
    action: "approve or reject this inference",
  });
  
  if (decision === "approve") {
    return {};
  }
  return { error: "Rejected by analyst" };
}
```

## The Tell Workflows

### Signal Analysis Pipeline

Linear graph: extract → classify → identify themes → score → summarize.

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";

function buildSignalAnalysisGraph() {
  const graph = new StateGraph<SignalAnalysisState>({
    channels: {
      signalId: { value: (x, y) => y ?? x },
      rawText: { value: (x, y) => y ?? x },
      companyId: { value: (x, y) => y ?? x },
      facts: { value: (x, y) => y ?? x },
      sentiment: { value: (x, y) => y ?? x },
      themes: { value: (x, y) => y ?? x },
      confidenceScore: { value: (x, y) => y ?? x },
      summary: { value: (x, y) => y ?? x },
      error: { value: (x, y) => y ?? x },
    },
  });

  graph.addNode("extract_facts", extractFacts);
  graph.addNode("classify_sentiment", classifySentiment);
  graph.addNode("identify_themes", identifyThemes);
  graph.addNode("score_confidence", scoreConfidence);
  graph.addNode("generate_summary", generateSummary);
  graph.addNode("failed_analysis", deadLetterNode);

  graph.addEdge(START, "extract_facts");
  graph.addEdge("extract_facts", "classify_sentiment");
  graph.addEdge("classify_sentiment", "identify_themes");
  graph.addEdge("identify_themes", "score_confidence");

  graph.addConditionalEdges("score_confidence", (state) => 
    state.error ? "failed_analysis" : "generate_summary"
  );

  graph.addEdge("generate_summary", END);
  graph.addEdge("failed_analysis", END);

  return graph.compile();
}
```

### Cross-Signal Inference

Cyclic graph that connects multiple signals for pattern detection. Uses a loop with a max iteration guard.

```typescript
interface InferenceState {
  signalIds: string[];
  signalTexts: string[];
  patterns: Array<{ conclusion: string; evidence: string[] }>;
  iteration: number;
  finalInference: string;
}

async function gatherSignals(state: InferenceState): Promise<Partial<InferenceState>> {
  const texts = await fetchSignalTexts(state.signalIds);
  return { signalTexts: texts };
}

async function detectPatterns(state: InferenceState): Promise<Partial<InferenceState>> {
  const provider = getProvider("openai");
  const combined = state.signalTexts.join("\n---\n");
  const prompt = `Detect strategic patterns across these signals:\n${combined}`;
  
  const result = await provider.completeStructured(
    [{ role: "user", content: prompt }],
    PatternListSchema,
  );
  
  return { patterns: [...state.patterns, ...result.patterns] };
}

async function refineInference(state: InferenceState): Promise<Partial<InferenceState>> {
  const iteration = state.iteration + 1;
  if (iteration >= 3) {
    return {
      iteration,
      finalInference: state.patterns[state.patterns.length - 1]?.conclusion ?? "",
    };
  }
  return { iteration };
}

function shouldContinue(state: InferenceState): string {
  if (state.iteration >= 3) {
    return "finalize";
  }
  return "detect_patterns";
}

function buildCrossSignalGraph() {
  const graph = new StateGraph<InferenceState>({
    channels: {
      signalIds: { value: (x, y) => y ?? x },
      signalTexts: { value: (x, y) => y ?? x },
      patterns: { value: (x, y) => [...x, ...y] },
      iteration: { value: (x, y) => y ?? x },
      finalInference: { value: (x, y) => y ?? x },
    },
  });

  graph.addNode("gather_signals", gatherSignals);
  graph.addNode("detect_patterns", detectPatterns);
  graph.addNode("refine_inference", refineInference);
  graph.addNode("finalize", finalizeInference);

  graph.addEdge(START, "gather_signals");
  graph.addEdge("gather_signals", "detect_patterns");
  graph.addEdge("detect_patterns", "refine_inference");
  graph.addConditionalEdges("refine_inference", shouldContinue);
  graph.addEdge("finalize", END);

  return graph.compile();
}
```

### Article Generation

Sequential graph with an editorial review interrupt before publishing.

```typescript
interface ArticleState {
  signalId: string;
  analysis: any;
  headline: string;
  summary: string;
  body: string;
  approved: boolean;
}

async function generateHeadline(state: ArticleState): Promise<Partial<ArticleState>> {
  const provider = getProvider("openai");
  const prompt = `Write a compelling headline for:\n${state.analysis.summary}`;
  
  const result = await provider.completeStructured(
    [{ role: "user", content: prompt }],
    HeadlineSchema,
  );
  
  return { headline: result.headline };
}

async function generateSummary(state: ArticleState): Promise<Partial<ArticleState>> {
  const provider = getProvider("openai");
  const prompt = `Write a 2-paragraph summary:\n${state.headline}\n${state.analysis.summary}`;
  
  const result = await provider.completeStructured(
    [{ role: "user", content: prompt }],
    SummarySchema,
  );
  
  return { summary: result.summary };
}

async function generateBody(state: ArticleState): Promise<Partial<ArticleState>> {
  const provider = getProvider("openai");
  const prompt = `Write the full article body:\nHeadline: ${state.headline}\nSummary: ${state.summary}`;
  
  const result = await provider.completeStructured(
    [{ role: "user", content: prompt }],
    BodySchema,
  );
  
  return { body: result.body };
}

async function editorialReview(state: ArticleState): Promise<Partial<ArticleState>> {
  const decision = await interrupt({
    headline: state.headline,
    summary: state.summary,
    action: "approve or request changes",
  });
  
  return { approved: decision === "approve" };
}

function buildArticleGenerationGraph() {
  const graph = new StateGraph<ArticleState>({
    channels: {
      signalId: { value: (x, y) => y ?? x },
      analysis: { value: (x, y) => y ?? x },
      headline: { value: (x, y) => y ?? x },
      summary: { value: (x, y) => y ?? x },
      body: { value: (x, y) => y ?? x },
      approved: { value: (x, y) => y ?? x },
    },
  });

  graph.addNode("generate_headline", generateHeadline);
  graph.addNode("generate_summary", generateSummary);
  graph.addNode("generate_body", generateBody);
  graph.addNode("editorial_review", editorialReview);
  graph.addNode("publish", publishArticle);
  graph.addNode("revise", reviseArticle);

  graph.addEdge(START, "generate_headline");
  graph.addEdge("generate_headline", "generate_summary");
  graph.addEdge("generate_summary", "generate_body");
  graph.addEdge("generate_body", "editorial_review");
  
  graph.addConditionalEdges("editorial_review", (state) => 
    state.approved ? "publish" : "revise"
  );
  
  graph.addEdge("revise", "editorial_review");
  graph.addEdge("publish", END);

  return graph.compile();
}
```

## Checkpointing

Use `PostgresSaver` for crash recovery. Reuses the existing `DATABASE_URL`.

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

async function getCheckpointer(): Promise<PostgresSaver> {
  return await PostgresSaver.fromConnString(process.env.DATABASE_URL!);
}

async function buildGraph() {
  const checkpointer = await getCheckpointer();
  const graph = buildSignalAnalysisGraph();
  return graph.compile({ checkpointer });
}

// Invoke with threadId for isolation
const result = await app.invoke(
  { signalId: "abc-123", rawText: "...", companyId: "co-456" },
  { configurable: { threadId: "analysis-abc-123" } },
);
```

### Crash Recovery

Resume from the last checkpoint after a failure:

```typescript
// Get the state at any checkpoint
const state = await app.getState(config);

// Resume from where it left off
const result = await app.invoke(null, config);
```

### Time-Travel Debugging

Replay from any previous checkpoint:

```typescript
// List all checkpoints for a thread
const history = await app.getStateHistory(config);

// Replay from a specific checkpoint
await app.invoke(null, {
  configurable: { threadId: "...", checkpointId: "..." },
});
```

## Streaming

### Token-Level Streaming

Use `streamEvents()` for real-time token streaming to the frontend via WebSocket or SSE.

```typescript
async function streamAnalysis(signalData: any, websocket: WebSocket) {
  const config = { configurable: { threadId: `analysis-${signalData.signalId}` } };
  
  for await (const event of app.streamEvents(signalData, config, "v2")) {
    const kind = event.event;
    if (kind === "on_chat_model_stream") {
      const token = event.data.chunk.content;
      websocket.send(JSON.stringify({ type: "token", content: token }));
    } else if (kind === "on_chain_end") {
      websocket.send(JSON.stringify({ type: "node_complete", node: event.name }));
    }
  }
}
```

### Node-Level Streaming

Stream intermediate results (facts extracted, sentiment classified) without token-level detail:

```typescript
for await (const chunk of app.stream(signalData, config)) {
  for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
    websocket.send(JSON.stringify({
      type: "node_output",
      node: nodeName,
      data: nodeOutput,
    }));
  }
}
```

## Subgraph Patterns

Use subgraphs when a workflow has distinct phases with their own state.

```typescript
// Child graph: fact extraction sub-workflow
const factGraph = new StateGraph<FactState>({
  channels: {
    text: { value: (x, y) => y ?? x },
    facts: { value: (x, y) => y ?? x },
  },
});
factGraph.addNode("parse", parseText);
factGraph.addNode("validate", validateFacts);
factGraph.addEdge(START, "parse");
factGraph.addEdge("parse", "validate");
factGraph.addEdge("validate", END);
const compiledFacts = factGraph.compile();

// Parent graph: uses child as a node
const parentGraph = new StateGraph<SignalAnalysisState>({
  channels: { /* ... */ },
});
parentGraph.addNode("extract_facts", compiledFacts);
parentGraph.addNode("classify", classifySentiment);
parentGraph.addEdge(START, "extract_facts");
parentGraph.addEdge("extract_facts", "classify");
parentGraph.addEdge("classify", END);
```

**When to use subgraphs vs. flat graphs:**

| Use Subgraph When | Use Flat Graph When |
|---|---|
| Phase has its own internal state | All nodes share the same state |
| Phase is reusable across workflows | Workflow has < 8 nodes |
| Phase needs independent checkpointing | Linear or simple branching flow |

## Memory

### Thread-Level Memory

Single analysis context — facts and context persist across nodes within one thread.

```typescript
// State automatically persists across nodes within a threadId
const config = { configurable: { threadId: "analysis-abc-123" } };
const result = await app.invoke(inputData, config);
```

### Cross-Thread Memory (Store API)

Company context across multiple analyses using LangGraph's `Store` API:

```typescript
import { InMemoryStore } from "@langchain/langgraph";

const store = new InMemoryStore();

async function enrichWithCompanyContext(
  state: SignalAnalysisState,
  { store }: { store: InMemoryStore }
): Promise<Partial<SignalAnalysisState>> {
  const companyId = state.companyId;
  const previous = await store.get(["company", companyId], "analysis_context");
  const context = previous?.value ?? {};
  
  return {
    // Add context to state
  };
}
```

## Error Recovery

### Retry Policies

Wrap individual nodes with retry logic:

```typescript
async function extractFactsWithRetry(state: SignalAnalysisState): Promise<Partial<SignalAnalysisState>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await extractFacts(state);
    } catch (error) {
      if (attempt === 2) {
        return { error: `Failed after 3 attempts: ${error}` };
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  return { error: "Unreachable" };
}
```

### Fallback Edges

Route to fallback nodes when a primary node fails:

```typescript
function routeOnError(state: SignalAnalysisState): string {
  if (state.error) {
    return "fallback_summary";
  }
  return "generate_summary";
}

graph.addConditionalEdges("score_confidence", routeOnError);
```

### Dead-Letter Node

Capture failed analyses for later investigation:

```typescript
async function deadLetterNode(state: SignalAnalysisState): Promise<Partial<SignalAnalysisState>> {
  console.error(`Analysis failed for signal ${state.signalId}: ${state.error}`);
  await saveFailedAnalysis(state.signalId, state.error);
  return {};
}
```

## Performance

### Parallel Execution with `Send()`

Use `Send()` API to fan out independent work across multiple signals:

```typescript
import { Send } from "@langchain/langgraph";

interface BatchState {
  signalIds: string[];
  rawTexts: string[];
  results: any[];
}

async function fanOutSignals(state: BatchState): Promise<Send[]> {
  return state.signalIds.map((signalId, i) => 
    new Send("analyze_single", { signalId, rawText: state.rawTexts[i] })
  );
}

graph.addConditionalEdges("fan_out", fanOutSignals);
```

### When to Parallelize

| Parallelize | Keep Sequential |
|---|---|
| Independent signal analyses | Steps that depend on prior output |
| Multi-source fact extraction | Sentiment after fact extraction |
| Batch company lookups | Confidence scoring after all facts |

## Common Mistakes

### 1. Mutating State in Nodes

```typescript
// BAD — mutates state directly
async function badNode(state: SignalAnalysisState): Promise<SignalAnalysisState> {
  state.facts.push(newFact); // Mutation!
  return state;
}

// GOOD — return partial state
async function goodNode(state: SignalAnalysisState): Promise<Partial<SignalAnalysisState>> {
  return { facts: [...state.facts, newFact] };
}
```

### 2. Hidden Tool Calls in Model Nodes

```typescript
// BAD — LLM calls tools internally, graph can't track them
async function badModelNode(state) {
  const response = await provider.complete(prompt, { tools: [searchTool] });
  // Tool results hidden from graph state
  return { summary: response };
}

// GOOD — explicit tool loop in graph structure
graph.addNode("model", modelWithTools);
graph.addNode("tools", toolNode([searchTool]));
graph.addConditionalEdges("model", shouldCallTools);
```

### 3. Unbounded Loops

```typescript
// BAD — can loop forever
graph.addEdge("refine", "check");
graph.addConditionalEdges("check", (s) => !done(s) ? "refine" : END);

// GOOD — max iteration guard
async function refine(state) {
  if (state.iteration >= MAX_ITERATIONS) {
    return { error: "Max iterations reached" };
  }
  return { iteration: state.iteration + 1 };
}
```

### 4. Blocking I/O in Async Nodes

```typescript
// BAD — blocks the event loop
async function badNode(state) {
  const response = await fetch(url); // This is fine in Node.js
  return { data: await response.json() };
}

// GOOD — proper async I/O
async function goodNode(state) {
  const response = await fetch(url);
  return { data: await response.json() };
}
```

### 5. Not Using Checkpointing

```typescript
// BAD — no crash recovery
const app = graph.compile();

// GOOD — checkpoint for recovery
const app = graph.compile({ checkpointer });
```

## Quick Reference

| Pattern | Code |
|---|---|
| **State definition** | `interface MyState { field: Type }` |
| **Node function** | `async function node(state: MyState): Promise<Partial<MyState>>` |
| **Graph compilation** | `new StateGraph({ channels }).addNode().addEdge().compile()` |
| **Conditional routing** | `graph.addConditionalEdges("node", routerFn, { "a": "b" })` |
| **Checkpointing** | `graph.compile({ checkpointer: await PostgresSaver.fromConnString(url) })` |
| **Interrupt** | `const decision = await interrupt({ action: "approve?" })` |
| **Streaming** | `for await (const event of app.streamEvents(input, config, "v2"))` |
| **Parallel fan-out** | `return items.map(item => new Send("node", data))` |
| **Thread config** | `{ configurable: { threadId: "unique-id" } }` |

## Related Skills

- **pydanticai-agents** — LLM agent patterns with structured outputs
- **signal-analysis** — Analysis pipeline patterns
- **data-modeling** — TypeScript interface design
