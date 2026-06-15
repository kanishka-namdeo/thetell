---
name: langgraph-orchestration
description: Use when building multi-step LLM workflows, implementing state machines, cross-signal inference, or article generation pipelines with LangGraph in The Tell backend
---

# LangGraph Orchestration

## Overview

LangGraph provides explicit control over multi-step LLM workflows through a state machine model. Unlike simple chain-of-thought prompting, LangGraph gives you:

- **Nodes** — async Python functions that process and return partial state
- **Edges** — deterministic or conditional transitions between nodes
- **State** — a `TypedDict` that flows through the graph
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

Use `TypedDict` with `Annotated` reducers. Every list field needs an append reducer.

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class Fact(TypedDict):
    statement: str
    confidence: float
    source_url: str

class SignalAnalysisState(TypedDict):
    # Input
    signal_id: str
    raw_text: str
    company_id: str
    # Intermediate
    facts: Annotated[list[Fact], lambda a, b: a + b]
    sentiment: str
    themes: list[str]
    # Output
    confidence_score: float
    summary: str
    # Control
    error: str | None
    messages: Annotated[list[BaseMessage], add_messages]
```

### Node Functions

Nodes are async functions that return partial state dicts. Never mutate state directly.

```python
from app.llm.provider import get_llm_provider

async def extract_facts(state: SignalAnalysisState) -> dict:
    llm = get_llm_provider()
    prompt = f"Extract key facts from:\n{state['raw_text']}"
    response = await llm.complete_structured(prompt, FactListSchema)
    return {"facts": response.facts}

async def classify_sentiment(state: SignalAnalysisState) -> dict:
    llm = get_llm_provider()
    facts_text = "\n".join(f["statement"] for f in state["facts"])
    prompt = f"Classify sentiment as positive/negative/neutral:\n{facts_text}"
    result = await llm.complete(prompt)
    return {"sentiment": result.strip().lower()}
```

### Graph Compilation

```python
from langgraph.graph import StateGraph, START, END

graph = StateGraph(SignalAnalysisState)
graph.add_node("extract_facts", extract_facts)
graph.add_node("classify_sentiment", classify_sentiment)
graph.add_node("identify_themes", identify_themes)
graph.add_node("score_confidence", score_confidence)
graph.add_node("generate_summary", generate_summary)

graph.add_edge(START, "extract_facts")
graph.add_edge("extract_facts", "classify_sentiment")
graph.add_edge("classify_sentiment", "identify_themes")
graph.add_edge("identify_themes", "score_confidence")
graph.add_edge("score_confidence", "generate_summary")
graph.add_edge("generate_summary", END)

app = graph.compile()
```

### Conditional Routing

Use `add_conditional_edges()` with a pure router function — no side effects.

```python
def route_by_confidence(state: SignalAnalysisState) -> str:
    if state.get("error"):
        return "dead_letter"
    if state["confidence_score"] >= 0.8:
        return "publish"
    return "review"

graph.add_conditional_edges(
    "score_confidence",
    route_by_confidence,
    {
        "publish": "generate_summary",
        "review": "analyst_review",
        "dead_letter": "failed_analysis",
    }
)
```

### Interrupts (Human-in-the-Loop)

Pause execution for analyst review before publishing high-impact inferences.

```python
from langgraph.types import interrupt, Command

async def analyst_review(state: SignalAnalysisState) -> dict:
    decision = interrupt({
        "signal_id": state["signal_id"],
        "summary": state["summary"],
        "confidence": state["confidence_score"],
        "action": "approve or reject this inference",
    })
    if decision == "approve":
        return {"messages": [{"role": "human", "content": "Approved"}]}
    return {"error": "Rejected by analyst"}
```

## The Tell Workflows

### Signal Analysis Pipeline

Linear graph: extract → classify → identify themes → score → summarize.

```python
from langgraph.graph import StateGraph, START, END

def build_signal_analysis_graph():
    graph = StateGraph(SignalAnalysisState)

    graph.add_node("extract_facts", extract_facts)
    graph.add_node("classify_sentiment", classify_sentiment)
    graph.add_node("identify_themes", identify_themes)
    graph.add_node("score_confidence", score_confidence)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("failed_analysis", dead_letter_node)

    graph.add_edge(START, "extract_facts")
    graph.add_edge("extract_facts", "classify_sentiment")
    graph.add_edge("classify_sentiment", "identify_themes")
    graph.add_edge("identify_themes", "score_confidence")

    graph.add_conditional_edges(
        "score_confidence",
        lambda s: "failed_analysis" if s.get("error") else "generate_summary",
    )

    graph.add_edge("generate_summary", END)
    graph.add_edge("failed_analysis", END)

    return graph.compile()
```

### Cross-Signal Inference

Cyclic graph that connects multiple signals for pattern detection. Uses a loop with a max iteration guard.

```python
class InferenceState(TypedDict):
    signal_ids: list[str]
    signal_texts: Annotated[list[str], lambda a, b: a + b]
    patterns: Annotated[list[dict], lambda a, b: a + b]
    iteration: int
    final_inference: str

async def gather_signals(state: InferenceState) -> dict:
    texts = await fetch_signal_texts(state["signal_ids"])
    return {"signal_texts": texts}

async def detect_patterns(state: InferenceState) -> dict:
    llm = get_llm_provider()
    combined = "\n---\n".join(state["signal_texts"])
    prompt = f"Detect strategic patterns across these signals:\n{combined}"
    result = await llm.complete_structured(prompt, PatternListSchema)
    return {"patterns": result.patterns}

async def refine_inference(state: InferenceState) -> dict:
    iteration = state["iteration"] + 1
    if iteration >= 3:
        return {"iteration": iteration, "final_inference": state["patterns"][-1].get("conclusion", "")}
    return {"iteration": iteration}

def should_continue(state: InferenceState) -> str:
    if state["iteration"] >= 3:
        return "finalize"
    return "detect_patterns"

def build_cross_signal_graph():
    graph = StateGraph(InferenceState)
    graph.add_node("gather_signals", gather_signals)
    graph.add_node("detect_patterns", detect_patterns)
    graph.add_node("refine_inference", refine_inference)
    graph.add_node("finalize", finalize_inference)

    graph.add_edge(START, "gather_signals")
    graph.add_edge("gather_signals", "detect_patterns")
    graph.add_edge("detect_patterns", "refine_inference")
    graph.add_conditional_edges("refine_inference", should_continue)
    graph.add_edge("finalize", END)

    return graph.compile()
```

### Article Generation

Sequential graph with an editorial review interrupt before publishing.

```python
class ArticleState(TypedDict):
    signal_id: str
    analysis: dict
    headline: str
    summary: str
    body: str
    approved: bool
    messages: Annotated[list[BaseMessage], add_messages]

async def generate_headline(state: ArticleState) -> dict:
    llm = get_llm_provider()
    prompt = f"Write a compelling headline for:\n{state['analysis']['summary']}"
    return {"headline": (await llm.complete(prompt)).strip()}

async def generate_summary(state: ArticleState) -> dict:
    llm = get_llm_provider()
    prompt = f"Write a 2-paragraph summary:\n{state['headline']}\n{state['analysis']['summary']}"
    return {"summary": (await llm.complete(prompt)).strip()}

async def generate_body(state: ArticleState) -> dict:
    llm = get_llm_provider()
    prompt = f"Write the full article body:\nHeadline: {state['headline']}\nSummary: {state['summary']}"
    return {"body": (await llm.complete(prompt)).strip()}

async def editorial_review(state: ArticleState) -> dict:
    decision = interrupt({
        "headline": state["headline"],
        "summary": state["summary"],
        "action": "approve or request changes",
    })
    return {"approved": decision == "approve"}

def build_article_generation_graph():
    graph = StateGraph(ArticleState)
    graph.add_node("generate_headline", generate_headline)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("generate_body", generate_body)
    graph.add_node("editorial_review", editorial_review)
    graph.add_node("publish", publish_article)
    graph.add_node("revise", revise_article)

    graph.add_edge(START, "generate_headline")
    graph.add_edge("generate_headline", "generate_summary")
    graph.add_edge("generate_summary", "generate_body")
    graph.add_edge("generate_body", "editorial_review")
    graph.add_conditional_edges(
        "editorial_review",
        lambda s: "publish" if s.get("approved") else "revise",
    )
    graph.add_edge("revise", "editorial_review")
    graph.add_edge("publish", END)

    return graph.compile()
```

## Checkpointing

Use `AsyncPostgresSaver` for crash recovery. Reuses the existing `DATABASE_URL`.

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.config import settings

async def get_checkpointer() -> AsyncPostgresSaver:
    return AsyncPostgresSaver.from_conn_string(settings.database_url)

# Compile with checkpointer
async def build_graph():
    checkpointer = await get_checkpointer()
    graph = build_signal_analysis_graph()  # raw graph before compile
    return graph.compile(checkpointer=checkpointer)

# Invoke with thread_id for isolation
result = await app.ainvoke(
    {"signal_id": "abc-123", "raw_text": "...", "company_id": "co-456"},
    config={"configurable": {"thread_id": "analysis-abc-123"}},
)
```

### Crash Recovery

Resume from the last checkpoint after a failure:

```python
# Get the state at any checkpoint
state = await app.aget_state(config)

# Resume from where it left off
result = await app.ainvoke(None, config=config)
```

### Time-Travel Debugging

Replay from any previous checkpoint:

```python
# List all checkpoints for a thread
history = [c async for c in app.aget_state_history(config)]

# Replay from a specific checkpoint
await app.ainvoke(None, config={"configurable": {"thread_id": "...", "checkpoint_id": "..."}})
```

## Streaming

### Token-Level Streaming

Use `astream_events()` for real-time token streaming to the frontend via WebSocket or SSE.

```python
async def stream_analysis(signal_data: dict, websocket):
    config = {"configurable": {"thread_id": f"analysis-{signal_data['signal_id']}"}}
    async for event in app.astream_events(signal_data, config=config, version="v2"):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            token = event["data"]["chunk"].content
            await websocket.send_json({"type": "token", "content": token})
        elif kind == "on_chain_end":
            await websocket.send_json({"type": "node_complete", "node": event["name"]})
```

### Node-Level Streaming

Stream intermediate results (facts extracted, sentiment classified) without token-level detail:

```python
async for chunk in app.astream(signal_data, config=config):
    for node_name, node_output in chunk.items():
        await websocket.send_json({
            "type": "node_output",
            "node": node_name,
            "data": node_output,
        })
```

## Subgraph Patterns

Use subgraphs when a workflow has distinct phases with their own state.

```python
# Child graph: fact extraction sub-workflow
fact_graph = StateGraph(FactState)
fact_graph.add_node("parse", parse_text)
fact_graph.add_node("validate", validate_facts)
fact_graph.add_edge(START, "parse")
fact_graph.add_edge("parse", "validate")
fact_graph.add_edge("validate", END)
compiled_facts = fact_graph.compile()

# Parent graph: uses child as a node
parent_graph = StateGraph(SignalAnalysisState)
parent_graph.add_node("extract_facts", compiled_facts)
parent_graph.add_node("classify", classify_sentiment)
parent_graph.add_edge(START, "extract_facts")
parent_graph.add_edge("extract_facts", "classify")
parent_graph.add_edge("classify", END)
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

```python
# State automatically persists across nodes within a thread_id
config = {"configurable": {"thread_id": "analysis-abc-123"}}
result = await app.ainvoke(input_data, config=config)
```

### Cross-Thread Memory (Store API)

Company context across multiple analyses using LangGraph's `Store` API:

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

async def enrich_with_company_context(state: SignalAnalysisState, *, store):
    company_id = state["company_id"]
    # Retrieve previous analysis context
    previous = await store.aget(("company", company_id), "analysis_context")
    context = previous.value if previous else {}
    return {"messages": [{"role": "system", "content": f"Prior context: {context}"}]}
```

## Error Recovery

### Retry Policies

Wrap individual nodes with retry logic:

```python
import asyncio

async def extract_facts_with_retry(state: SignalAnalysisState) -> dict:
    for attempt in range(3):
        try:
            return await extract_facts(state)
        except LLMProviderError:
            if attempt == 2:
                return {"error": f"Failed after 3 attempts"}
            await asyncio.sleep(2 ** attempt)
```

### Fallback Edges

Route to fallback nodes when a primary node fails:

```python
def route_on_error(state: SignalAnalysisState) -> str:
    if state.get("error"):
        return "fallback_summary"
    return "generate_summary"

graph.add_conditional_edges("score_confidence", route_on_error)
```

### Dead-Letter Node

Capture failed analyses for later investigation:

```python
async def dead_letter_node(state: SignalAnalysisState) -> dict:
    logger.error(f"Analysis failed for signal {state['signal_id']}: {state.get('error')}")
    await save_failed_analysis(state["signal_id"], state.get("error"))
    return {}
```

## Performance

### Parallel Execution with `Send()`

Use `Send()` API to fan out independent work across multiple signals:

```python
from langgraph.types import Send

async def fan_out_signals(state: BatchState) -> list[Send]:
    return [
        Send("analyze_single", {"signal_id": sid, "raw_text": text})
        for sid, text in zip(state["signal_ids"], state["raw_texts"])
    ]

graph.add_conditional_edges("fan_out", fan_out_signals)
```

### When to Parallelize

| Parallelize | Keep Sequential |
|---|---|
| Independent signal analyses | Steps that depend on prior output |
| Multi-source fact extraction | Sentiment after fact extraction |
| Batch company lookups | Confidence scoring after all facts |

## Common Mistakes

### 1. Mutating State in Nodes

```python
# BAD — mutates state directly
async def bad_node(state: SignalAnalysisState) -> dict:
    state["facts"].append(new_fact)  # Mutation!
    return state

# GOOD — return partial state
async def good_node(state: SignalAnalysisState) -> dict:
    return {"facts": state["facts"] + [new_fact]}
```

### 2. Hidden Tool Calls in Model Nodes

```python
# BAD — LLM calls tools internally, graph can't track them
async def bad_model_node(state):
    response = await llm.complete(prompt, tools=[search_tool])
    # Tool results hidden from graph state
    return {"summary": response}

# GOOD — explicit tool loop in graph structure
graph.add_node("model", model_with_tools)
graph.add_node("tools", ToolNode([search_tool]))
graph.add_conditional_edges("model", should_call_tools)
```

### 3. Unbounded Loops

```python
# BAD — can loop forever
graph.add_edge("refine", "check")
graph.add_conditional_edges("check", lambda s: "refine" if not done(s) else END)

# GOOD — max iteration guard
async def refine(state):
    if state["iteration"] >= MAX_ITERATIONS:
        return {"error": "Max iterations reached"}
    return {"iteration": state["iteration"] + 1}
```

### 4. Blocking I/O in Async Nodes

```python
# BAD — blocks the event loop
async def bad_node(state):
    response = requests.get(url)  # Blocking!
    return {"data": response.json()}

# GOOD — async I/O
async def good_node(state):
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
    return {"data": response.json()}
```

### 5. Not Using Checkpointing

```python
# BAD — no crash recovery
app = graph.compile()

# GOOD — checkpoint for recovery
app = graph.compile(checkpointer=checkpointer)
```

## Quick Reference

| Pattern | Code |
|---|---|
| **State definition** | `class MyState(TypedDict): field: Annotated[list, lambda a,b: a+b]` |
| **Node function** | `async def node(state: MyState) -> dict: return {"field": value}` |
| **Graph compilation** | `StateGraph(MyState).add_node().add_edge().compile()` |
| **Conditional routing** | `graph.add_conditional_edges("node", router_fn, {"a": "b", "c": "d"})` |
| **Checkpointing** | `graph.compile(checkpointer=AsyncPostgresSaver.from_conn_string(url))` |
| **Interrupt** | `decision = interrupt({"action": "approve?"})` |
| **Streaming** | `async for event in app.astream_events(input, version="v2"):` |
| **Parallel fan-out** | `return [Send("node", data) for data in items]` |
| **Thread config** | `config={"configurable": {"thread_id": "unique-id"}}` |
