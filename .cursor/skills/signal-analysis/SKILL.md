---
name: signal-analysis
description: Use when processing scraped data into analysis-ready format, extracting insights from raw public signals (news, filings, social media), or building the analysis pipeline
---

# Signal Analysis

## Overview

Transform raw public data (news articles, SEC filings, social media posts) into structured insights through a **LangGraph state graph** where each node is a **PydanticAI agent** with typed `output_type`. The pipeline converts unstructured text into actionable intelligence about company operations with crash recovery, conditional routing, and per-node retry.

## When to Use

- Processing scraped news articles or press releases
- Analyzing SEC filings (10-K, 10-Q, 8-K)
- Extracting insights from social media mentions
- Building any feature that requires understanding company behavior
- Converting raw text into structured data for downstream consumption
- Scoring confidence in extracted insights

## Architecture

Pipeline: `extract_facts → classify_sentiment → identify_themes → score_confidence → generate_summary`

Each node wraps a PydanticAI agent with typed `output_type`. The graph uses `AsyncPostgresSaver` for crash recovery and conditional edges to skip to FAILED on empty results or errors.

## State Definition

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class Fact(TypedDict):
    statement: str
    entities: list[str]
    source_url: str

class SignalAnalysisState(TypedDict):
    # Input
    signal_id: str
    raw_text: str
    company_id: str
    # Intermediate results
    facts: Annotated[list[Fact], lambda a, b: a + b]
    sentiment: str
    themes: list[str]
    # Output
    confidence_score: float
    summary: str
    # Control
    status: str  # "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
    error: str | None
    messages: Annotated[list[BaseMessage], add_messages]
```

## PydanticAI Agent Nodes

Each node wraps a PydanticAI `Agent` with a typed `output_type`. This guarantees validated, structured output with automatic retry on schema mismatch.

### Output Models

```python
from pydantic import BaseModel, Field

class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of key facts extracted")
    entities: list[str] = Field(description="Companies, people, products mentioned")
    confidence: float = Field(description="Confidence in extraction 0.0-1.0", ge=0.0, le=1.0)

class SentimentOutput(BaseModel):
    sentiment: str = Field(description="positive, negative, or neutral")
    confidence: float = Field(description="Confidence 0.0-1.0", ge=0.0, le=1.0)
    reasoning: str = Field(description="Brief explanation of sentiment classification")
    key_phrases: list[str] = Field(description="Phrases that drove sentiment")

class ThemeOutput(BaseModel):
    themes: list[str] = Field(description="Strategic themes detected")
    primary_theme: str = Field(description="Most prominent theme")
    confidence: float = Field(description="Confidence in theme detection 0.0-1.0", ge=0.0, le=1.0)

class ConfidenceOutput(BaseModel):
    confidence_score: float = Field(description="Overall confidence 0.0-1.0", ge=0.0, le=1.0)
    factors: list[str] = Field(description="Factors that influenced confidence")
    risks: list[str] = Field(description="Risks or uncertainties")

class SummaryOutput(BaseModel):
    summary: str = Field(description="2-3 sentence executive summary")
    key_takeaways: list[str] = Field(description="3-5 key takeaways")
```

### Agent Definitions

```python
from pydantic_ai import Agent, RunContext
from dataclasses import dataclass
from sqlalchemy.orm import Session

@dataclass
class AnalysisDeps:
    db_session: Session
    signal_id: str

fact_agent = Agent(
    'openai:gpt-4o',
    deps_type=AnalysisDeps,
    output_type=FactExtractionOutput,
    instructions=(
        'Extract key facts from corporate signals. '
        'Identify entities, actions, and strategic implications. '
        'Focus on concrete, verifiable information.'
    ),
)

sentiment_agent = Agent(
    'openai:gpt-4o',
    output_type=SentimentOutput,
    instructions=(
        'Classify sentiment of corporate communications. '
        'Focus on strategic sentiment (growth, risk, uncertainty). '
        'Provide reasoning and key phrases that drove classification.'
    ),
)

theme_agent = Agent(
    'openai:gpt-4o',
    output_type=ThemeOutput,
    instructions=(
        'Detect strategic themes in corporate signals. '
        'Themes include: expansion, cost-cutting, innovation, M&A, '
        'regulatory, leadership changes, market entry/exit.'
    ),
)

confidence_agent = Agent(
    'openai:gpt-4o',
    output_type=ConfidenceOutput,
    instructions=(
        'Score confidence in strategic inferences. '
        'Consider: evidence quality, source reliability, '
        'corroboration, specificity, and consistency.'
    ),
)

summary_agent = Agent(
    'openai:gpt-4o',
    output_type=SummaryOutput,
    instructions=(
        'Write a concise executive summary of signal analysis results. '
        'Include key takeaways for investment analysts.'
    ),
)
```

## Node Functions

Each node calls its PydanticAI agent and returns partial state. All nodes follow the same retry pattern:

```python
import asyncio
import structlog

logger = structlog.get_logger()

async def extract_facts(state: SignalAnalysisState) -> dict:
    deps = AnalysisDeps(db_session=get_db_session(), signal_id=state["signal_id"])
    for attempt in range(3):
        try:
            result = await fact_agent.run(state["raw_text"], deps=deps)
            facts = [
                Fact(statement=f, entities=[], source_url=state.get("signal_id", ""))
                for f in result.output.facts
            ]
            return {"facts": facts, "status": "RUNNING"}
        except Exception as e:
            logger.warning("node.retry", node="extract_facts", attempt=attempt + 1, error=str(e))
            if attempt == 2:
                return {"error": f"Fact extraction failed: {e}", "status": "FAILED"}
            await asyncio.sleep(2 ** attempt)
    return {"status": "FAILED"}

# classify_sentiment, identify_themes, score_confidence, generate_summary
# follow the same pattern: agent.run(prompt) → return partial state on success,
# return {"error": ..., "status": "FAILED"} on final failure.
# generate_summary returns {"status": "COMPLETED"} on success.

async def mark_failed(state: SignalAnalysisState) -> dict:
    logger.error("analysis.failed", signal_id=state["signal_id"], error=state.get("error"))
    return {"status": "FAILED"}
```

## Graph Construction

### Conditional Routing

Skip confidence scoring and jump to FAILED if fact extraction returns empty results.

```python
def route_after_extraction(state: SignalAnalysisState) -> str:
    if state.get("error"):
        return "mark_failed"
    if not state.get("facts"):
        return "mark_failed"
    return "classify_sentiment"

def route_on_error(state: SignalAnalysisState) -> str:
    if state.get("error") or state.get("status") == "FAILED":
        return "mark_failed"
    return "generate_summary"
```

### Full Graph

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.config import settings

def build_signal_analysis_graph():
    graph = StateGraph(SignalAnalysisState)

    # Add nodes
    graph.add_node("extract_facts", extract_facts)
    graph.add_node("classify_sentiment", classify_sentiment)
    graph.add_node("identify_themes", identify_themes)
    graph.add_node("score_confidence", score_confidence)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("mark_failed", mark_failed)

    # Edges
    graph.add_edge(START, "extract_facts")

    # Conditional: skip to FAILED if no facts extracted
    graph.add_conditional_edges(
        "extract_facts",
        route_after_extraction,
        {
            "classify_sentiment": "classify_sentiment",
            "mark_failed": "mark_failed",
        },
    )

    graph.add_edge("classify_sentiment", "identify_themes")
    graph.add_edge("identify_themes", "score_confidence")

    # Conditional: skip to FAILED on error during scoring
    graph.add_conditional_edges(
        "score_confidence",
        route_on_error,
        {
            "generate_summary": "generate_summary",
            "mark_failed": "mark_failed",
        },
    )

    graph.add_edge("generate_summary", END)
    graph.add_edge("mark_failed", END)

    return graph
```

## Checkpointing for Crash Recovery

Use `AsyncPostgresSaver` to persist state after each node. If the process crashes mid-pipeline, resume from the last completed node.

```python
async def get_compiled_graph():
    raw_graph = build_signal_analysis_graph()
    checkpointer = AsyncPostgresSaver.from_conn_string(settings.database_url)
    return raw_graph.compile(checkpointer=checkpointer)

async def analyze_signal(signal_id: str, raw_text: str, company_id: str):
    app = await get_compiled_graph()
    config = {"configurable": {"thread_id": f"analysis-{signal_id}"}}

    result = await app.ainvoke(
        {
            "signal_id": signal_id,
            "raw_text": raw_text,
            "company_id": company_id,
            "status": "PENDING",
            "error": None,
        },
        config=config,
    )
    return result
```

### Resuming After Crash

```python
async def resume_analysis(signal_id: str):
    app = await get_compiled_graph()
    config = {"configurable": {"thread_id": f"analysis-{signal_id}"}}

    # Check current state
    state = await app.aget_state(config)
    if state.values.get("status") == "COMPLETED":
        return state.values

    # Resume from last checkpoint
    result = await app.ainvoke(None, config=config)
    return result
```

## Integration with Pipeline

The graph integrates into `backend/app/analysis/pipeline.py` as the core execution engine:

```python
# backend/app/analysis/pipeline.py

from app.analysis.graph import get_compiled_graph

async def run_analysis_pipeline(signal_id: str, raw_text: str, company_id: str) -> dict:
    """Entry point for signal analysis. Called by API routes and scheduled jobs."""
    app = await get_compiled_graph()
    config = {"configurable": {"thread_id": f"analysis-{signal_id}"}}

    result = await app.ainvoke(
        {
            "signal_id": signal_id,
            "raw_text": raw_text,
            "company_id": company_id,
            "status": "PENDING",
            "error": None,
        },
        config=config,
    )

    if result.get("status") == "FAILED":
        raise AnalysisFailedError(result.get("error"))

    return result
```

## Quick Reference

### Signal Types

| Type | Examples | Indicators |
|------|----------|------------|
| Financial | Earnings, guidance, funding | Revenue, profit, loss, valuation |
| Operational | Product launches, updates | Release, feature, platform |
| Strategic | M&A, partnerships | Acquisition, merger, pivot |
| Cultural | Hiring, layoffs, policy | Remote, culture, restructure |

### Fact Extraction Checklist

- **Who**: Company, executives, partners
- **What**: Action, event, announcement
- **When**: Date, timeframe, quarter
- **Where**: Location, market, segment
- **Why**: Reason, motivation, context

### Confidence Factors

- Number of facts extracted (more = better)
- Source credibility (official filings > news > social)
- Corroboration (multiple sources confirm)
- Specificity (concrete details > vague claims)

### Context Enrichment

- Link to company profile (industry, size, stage)
- Historical signals (trend analysis)
- Competitor signals (relative positioning)
- Market context (macro trends)

## Common Mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Sequential LLM calls | No crash recovery — if node 3/5 fails, all prior work lost | Use LangGraph graph with checkpointing |
| No `output_type` | Manual JSON parsing, no validation, no auto-retry | PydanticAI agent with `output_type=Model` |
| No conditional routing | Runs all 5 nodes even on empty facts, wastes tokens | `add_conditional_edges()` to skip to FAILED |
| No checkpointing | Crash at node 4/5 = restart from node 1 | `AsyncPostgresSaver` checkpointer |

## Related Skills

- **pydanticai-agents** — PydanticAI agent patterns: `output_type`, dependency injection, tools, streaming
- **langgraph-orchestration** — LangGraph patterns: StateGraph, checkpointing, interrupts, streaming, subgraphs
- **data-modeling** — Pydantic model design (applies to `output_type` models)
- **llm-abstraction** — Lower-level LLM provider abstraction (use PydanticAI agents instead for pipeline nodes)
