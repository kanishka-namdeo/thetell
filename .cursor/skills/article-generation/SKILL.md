---
name: article-generation
description: Use when publishing analysis results, generating news-style articles from structured analysis, or creating readable content from insights
---

# Article Generation

## Overview

Transform structured analysis into readable, engaging articles using a **LangGraph orchestration graph** with **PydanticAI writer and editor agents**. The pipeline produces news-style content with proper attribution, citation tracking, and human-in-the-loop review before publishing.

## When to Use

- Publishing analysis results to users
- Generating daily/weekly digests
- Creating shareable content from insights
- Building any feature that presents analysis in human-readable form
- Scenarios requiring source attribution and evidence
- Workflows that need editorial review before publication

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LangGraph Article Graph                       │
│                                                                  │
│  START → generate_headline → generate_summary → generate_body   │
│                                    ↓                             │
│                              edit_review ──interrupt()──→ END    │
│                                    ↓                             │
│                                 publish → END                    │
│                                                                  │
│  Nodes use PydanticAI agents with structured output_type         │
│  Checkpointing via AsyncPostgresSaver for crash recovery         │
└─────────────────────────────────────────────────────────────────┘
```

## Output Models

Each generation step uses a dedicated Pydantic model as `output_type` for type-safe, validated results.

```python
from pydantic import BaseModel, Field

class HeadlineOutput(BaseModel):
    headline: str = Field(description="Article headline, under 100 characters")
    headline_type: str = Field(
        description="Pattern: question, revelation, prediction, or contrast"
    )
    confidence_aligned: bool = Field(
        description="True if headline tone matches analysis confidence level"
    )

class SummaryOutput(BaseModel):
    summary: str = Field(description="2-3 sentence lead paragraph")
    key_insight: str = Field(description="Single most important takeaway")

class ArticleBodyOutput(BaseModel):
    body: str = Field(description="Full article body in markdown")
    citations: list[Citation] = Field(description="Inline citations with source refs")
    key_takeaways: list[str] = Field(description="3-5 key takeaways")

class Citation(BaseModel):
    source_url: str
    source_title: str
    published_at: str | None = None
    credibility: str = Field(description="official, news, or social")
    quoted_text: str | None = Field(description="Exact text quoted from this source")
```

## PydanticAI Agents

### Writer Agent

Generates content at each stage. Uses model identifier strings for multi-provider support.

```python
from pydantic_ai import Agent, RunContext
from dataclasses import dataclass

@dataclass
class ArticleDeps:
    db_session: Session
    analysis: dict
    sources: list[dict]

writer_agent = Agent(
    'openai:gpt-4o',
    deps_type=ArticleDeps,
    output_type=HeadlineOutput,  # overridden per-step via run()
    instructions=(
        'You are a corporate intelligence journalist. '
        'Write accurate, engaging headlines and articles from analysis results. '
        'Tone: analytical, not sensational. '
        'Always cite sources. Match confidence level to tone.'
    ),
)

@writer_agent.tool
def get_analysis_context(ctx: RunContext[ArticleDeps]) -> str:
    """Provide the analysis data for article generation."""
    a = ctx.deps.analysis
    return (
        f"Company: {a['company_name']}\n"
        f"Facts: {a['facts']}\n"
        f"Sentiment: {a['sentiment']}\n"
        f"Themes: {a['themes']}\n"
        f"Confidence: {a['confidence']}"
    )

@writer_agent.tool
def get_source_list(ctx: RunContext[ArticleDeps]) -> str:
    """Provide available sources for citation."""
    return "\n".join(
        f"- {s['title']} ({s['url']}) credibility={s['credibility']}"
        for s in ctx.deps.sources
    )
```

### Editor Agent

Reviews and validates generated content for quality, accuracy, and citation integrity.

```python
editor_agent = Agent(
    'anthropic:claude-sonnet-4-5',
    deps_type=ArticleDeps,
    output_type=EditorReviewOutput,
    instructions=(
        'You are an editorial reviewer for a corporate intelligence publication. '
        'Check articles for: accuracy against source analysis, sensationalism, '
        'citation completeness, tone consistency, and structural quality. '
        'Return structured review with approve/revise decision.'
    ),
)

class EditorReviewOutput(BaseModel):
    approved: bool = Field(description="True if article meets editorial standards")
    issues: list[str] = Field(description="Specific issues found")
    suggestions: list[str] = Field(description="Improvement suggestions")
    citation_check: bool = Field(
        description="True if all claims are backed by citations"
    )
```

## LangGraph State

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class ArticleState(TypedDict):
    # Input
    signal_id: str
    analysis: dict
    sources: list[dict]
    # Generation outputs
    headline: str
    summary: str
    body: str
    # Citation tracking
    citations: Annotated[list[Citation], lambda a, b: a + b]
    # Editorial review
    editor_issues: list[str]
    revision_count: int
    approved: bool
    # Control
    error: str | None
    messages: Annotated[list[BaseMessage], add_messages]
```

## Graph Nodes

Each node calls the appropriate PydanticAI agent with the correct `output_type`.

```python
async def generate_headline(state: ArticleState) -> dict:
    deps = ArticleDeps(
        db_session=get_db(),
        analysis=state["analysis"],
        sources=state["sources"],
    )
    result = await writer_agent.run(
        "Generate a compelling but accurate headline for this analysis.",
        deps=deps,
        output_type=HeadlineOutput,
    )
    return {"headline": result.output.headline}

async def generate_summary(state: ArticleState) -> dict:
    deps = ArticleDeps(
        db_session=get_db(),
        analysis=state["analysis"],
        sources=state["sources"],
    )
    result = await writer_agent.run(
        f"Write a 2-3 sentence lead paragraph.\nHeadline: {state['headline']}",
        deps=deps,
        output_type=SummaryOutput,
    )
    return {
        "summary": result.output.summary,
    }

async def generate_body(state: ArticleState) -> dict:
    deps = ArticleDeps(
        db_session=get_db(),
        analysis=state["analysis"],
        sources=state["sources"],
    )
    result = await writer_agent.run(
        f"Write the full article body.\n"
        f"Headline: {state['headline']}\n"
        f"Summary: {state['summary']}\n"
        f"Include inline citations to sources.",
        deps=deps,
        output_type=ArticleBodyOutput,
    )
    return {
        "body": result.output.body,
        "citations": result.output.citations,
        "key_takeaways": result.output.key_takeaways,
    }
```

## Editorial Review with Interrupt

The editor agent reviews the full article. If issues are found, the graph loops back for revision. An `interrupt()` pauses before publish for human analyst approval.

```python
from langgraph.types import interrupt, Command

MAX_REVISIONS = 2

async def edit_review(state: ArticleState) -> dict:
    deps = ArticleDeps(
        db_session=get_db(),
        analysis=state["analysis"],
        sources=state["sources"],
    )
    review = await editor_agent.run(
        f"Review this article for publication:\n"
        f"Headline: {state['headline']}\n"
        f"Summary: {state['summary']}\n"
        f"Body: {state['body']}\n"
        f"Citations: {state['citations']}",
        deps=deps,
    )
    revision_count = state.get("revision_count", 0) + 1

    if review.output.approved or revision_count >= MAX_REVISIONS:
        # Pause for human analyst review before publishing
        decision = interrupt({
            "signal_id": state["signal_id"],
            "headline": state["headline"],
            "summary": state["summary"],
            "citations_count": len(state["citations"]),
            "editor_issues": review.output.issues,
            "action": "approve or request changes",
        })
        return {
            "approved": decision == "approve",
            "editor_issues": review.output.issues,
            "revision_count": revision_count,
        }

    return {
        "approved": False,
        "editor_issues": review.output.issues,
        "revision_count": revision_count,
    }

async def publish(state: ArticleState) -> dict:
    await save_article(
        signal_id=state["signal_id"],
        headline=state["headline"],
        summary=state["summary"],
        body=state["body"],
        citations=state["citations"],
    )
    return {}

async def revise(state: ArticleState) -> dict:
    # Re-run body generation with editor feedback
    deps = ArticleDeps(
        db_session=get_db(),
        analysis=state["analysis"],
        sources=state["sources"],
    )
    issues = "\n".join(state.get("editor_issues", []))
    result = await writer_agent.run(
        f"Revise the article body. Issues to fix:\n{issues}\n"
        f"Current body:\n{state['body']}",
        deps=deps,
        output_type=ArticleBodyOutput,
    )
    return {
        "body": result.output.body,
        "citations": result.output.citations,
    }
```

## Graph Compilation

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

def route_after_review(state: ArticleState) -> str:
    if state.get("error"):
        return "failed"
    if state.get("approved"):
        return "publish"
    if state.get("revision_count", 0) >= MAX_REVISIONS:
        return "publish"  # force publish after max revisions
    return "revise"

async def build_article_graph():
    graph = StateGraph(ArticleState)

    graph.add_node("generate_headline", generate_headline)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("generate_body", generate_body)
    graph.add_node("edit_review", edit_review)
    graph.add_node("revise", revise)
    graph.add_node("publish", publish)
    graph.add_node("failed", dead_letter_node)

    graph.add_edge(START, "generate_headline")
    graph.add_edge("generate_headline", "generate_summary")
    graph.add_edge("generate_summary", "generate_body")
    graph.add_edge("generate_body", "edit_review")
    graph.add_conditional_edges(
        "edit_review",
        route_after_review,
        {
            "publish": "publish",
            "revise": "revise",
            "failed": "failed",
        },
    )
    graph.add_edge("revise", "edit_review")
    graph.add_edge("publish", END)
    graph.add_edge("failed", END)

    checkpointer = await AsyncPostgresSaver.from_conn_string(
        settings.database_url
    )
    return graph.compile(checkpointer=checkpointer)
```

## Invocation

```python
async def generate_article(signal_id: str, analysis: dict, sources: list[dict]):
    app = await build_article_graph()
    config = {
        "configurable": {"thread_id": f"article-{signal_id}"}
    }
    result = await app.ainvoke(
        {
            "signal_id": signal_id,
            "analysis": analysis,
            "sources": sources,
            "citations": [],
            "revision_count": 0,
            "approved": False,
        },
        config=config,
    )
    return result

# Resume after interrupt (analyst approves)
async def approve_article(signal_id: str):
    app = await build_article_graph()
    config = {
        "configurable": {"thread_id": f"article-{signal_id}"}
    }
    result = await app.ainvoke(
        Command(resume="approve"),
        config=config,
    )
    return result
```

## Citation Tracking

Citations flow through state via the `Annotated` append reducer. Every node that produces citations appends to the list. The editor agent validates citation completeness.

```python
# Citations accumulate through the graph:
# generate_body → [{"source_url": "...", "quoted_text": "..."}]
# revise → appends revised citations
# edit_review → validates all citations match sources
# publish → saves final citation list with article

# In the editor agent, citation_check validates:
# 1. Every factual claim has a matching citation
# 2. Quoted text matches the source
# 3. Source URLs are valid
# 4. Credibility ratings are appropriate
```

## Headline Patterns

| Pattern | Example | When to Use |
|---------|---------|-------------|
| Question | "Is OpenAI Pivoting Away from Non-Profit?" | Uncertain implications |
| Revelation | "Stripe's Hidden Push into B2B Payments" | Unexpected finding |
| Prediction | "Why Anthropic's Latest Move Signals IPO Prep" | Forward-looking analysis |
| Contrast | "Meta's AI Spending Surges as Revenue Stalls" | Conflicting signals |

## Tone Guidelines

- **Analytical, not sensational**: "Company X shows signs of Y" not "Company X SHOCKS with Y"
- **Confident, not arrogant**: "Evidence suggests" not "It's obvious that"
- **Specific, not vague**: "Revenue grew 23% QoQ" not "Revenue increased significantly"
- **Attributed, not anonymous**: "According to SEC filing" not "Reports show"
- **Confidence-aware**: Low confidence → speculative tone; high confidence → direct tone

## Common Mistakes

### Mistake 1: Monolithic Generation

**Bad:**
```python
article = await llm.complete(f"Write full article: {analysis}")
```

**Good:**
```python
# LangGraph pipeline with structured steps
app = await build_article_graph()
result = await app.ainvoke(input_data, config=config)
```

**Why:** Structured generation produces consistent output; monolithic prompts are unpredictable and unreviewable.

### Mistake 2: No Editorial Review

**Bad:**
```python
# Publish directly after generation
graph.add_edge("generate_body", "publish")
```

**Good:**
```python
# Editor agent + human interrupt before publish
graph.add_edge("generate_body", "edit_review")
graph.add_conditional_edges("edit_review", route_after_review, ...)
```

**Why:** Without review, sensational or inaccurate articles reach users. Editor agent catches issues; human interrupt ensures accountability.

### Mistake 3: No Checkpointing

**Bad:**
```python
app = graph.compile()  # No crash recovery
```

**Good:**
```python
app = graph.compile(checkpointer=checkpointer)
```

**Why:** Article generation involves multiple LLM calls. Without checkpointing, a crash loses all progress. With checkpointing, resume from the last completed node.

### Mistake 4: Unbounded Revision Loop

**Bad:**
```python
# Can loop forever between edit_review and revise
graph.add_edge("revise", "edit_review")
```

**Good:**
```python
# Max revision guard in router
def route_after_review(state):
    if state["revision_count"] >= MAX_REVISIONS:
        return "publish"  # force publish
    return "revise"
```

**Why:** Editor and writer agents can disagree indefinitely. Max revisions prevent infinite loops.

### Mistake 5: Missing Citations

**Bad:**
```python
# No citation tracking — claims are unverifiable
return {"body": article_text}
```

**Good:**
```python
# Citations tracked through state
return {"body": result.output.body, "citations": result.output.citations}
```

**Why:** Without citations, readers cannot verify claims. Citation tracking ensures every factual statement links back to a source.

## Quick Reference

| Pattern | Code |
|---------|------|
| **Writer agent** | `Agent('openai:gpt-4o', deps_type=ArticleDeps, output_type=...)` |
| **Editor agent** | `Agent('anthropic:claude-sonnet-4-5', output_type=EditorReviewOutput)` |
| **Per-step output_type** | `writer_agent.run(prompt, output_type=HeadlineOutput)` |
| **Graph flow** | `headline → summary → body → edit_review → publish` |
| **Human interrupt** | `decision = interrupt({...})` before publish |
| **Revision loop** | `edit_review → revise → edit_review` with `MAX_REVISIONS` guard |
| **Citation tracking** | `Annotated[list[Citation], lambda a, b: a + b]` in state |
| **Checkpointing** | `graph.compile(checkpointer=AsyncPostgresSaver.from_conn_string(url))` |
| **Resume after interrupt** | `app.ainvoke(Command(resume="approve"), config=config)` |
| **Crash recovery** | `await app.ainvoke(None, config=config)` resumes from last checkpoint |

## Related Skills

- **pydanticai-agents** — Agent definition, `output_type`, dependency injection, tools
- **langgraph-orchestration** — State machines, conditional routing, checkpointing, interrupts
- **signal-analysis** — Upstream analysis that feeds into article generation
- **data-modeling** — Pydantic model design for `output_type` models
