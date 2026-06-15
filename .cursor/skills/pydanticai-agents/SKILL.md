---
name: pydanticai-agents
description: Use when building LLM-powered agent nodes, implementing structured output validation, multi-provider LLM integration, or dependency injection for AI agents in The Tell backend
---

# PydanticAI Agents

## Overview

PydanticAI brings **FastAPI-like ergonomics** to AI agent development. It provides:

- **Type-safe structured outputs** via Pydantic models with automatic validation
- **Multi-provider support** through model identifier strings (OpenAI, Anthropic, etc.)
- **Dependency injection** for testability and loose coupling
- **Built-in observability** via Logfire integration
- **Automatic validation retries** when LLM output fails schema validation

PydanticAI is the recommended framework for building LLM-powered nodes in The Tell's analysis pipeline.

## When to Use

- Building any LLM-powered agent node (fact extraction, sentiment analysis, theme detection)
- When you need structured, validated outputs from LLMs
- When you need to support multiple LLM providers without hardcoding
- When you need dependency injection for database sessions, API clients, or config
- When you need observability/tracing for LLM calls
- When you need streaming responses to the frontend

## Core Patterns

### Agent Definition

```python
from pydantic_ai import Agent
from pydantic import BaseModel, Field

class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of extracted facts")
    entities: list[str] = Field(description="Mentioned entities")
    sentiment: str = Field(description="Overall sentiment: positive/negative/neutral")

# Define agent with model, instructions, and output type
fact_agent = Agent(
    'openai:gpt-4o',  # Model identifier string
    output_type=FactExtractionOutput,  # Structured output type
    instructions=(
        'You extract key facts from corporate signals. '
        'Identify entities, actions, and strategic implications.'
    ),
)
```

**Key points:**
- Model identifier strings: `'openai:gpt-4o'`, `'anthropic:claude-sonnet-4-5'`, `'groq:llama-3-70b'`
- `output_type` guarantees the return type and enables auto-retry on validation failure
- `instructions` is the system prompt (can be static string or dynamic function)

### Tool Registration

Tools are functions the LLM can call during reasoning. Docstrings drive the tool schema.

```python
from pydantic_ai import Agent, RunContext

@agent.tool
def search_company_database(ctx: RunContext[MyDeps], company_name: str) -> str:
    """Search the company database for existing signals and inferences.
    
    Args:
        company_name: Name of the company to search for
    
    Returns:
        JSON string with matching companies and signal counts
    """
    # Access dependencies via ctx.deps
    db = ctx.deps.db_session
    results = db.query(Company).filter(Company.name == company_name).all()
    return f"Found {len(results)} companies"

@agent.tool_plain  # No RunContext needed (no dependencies)
def get_current_date() -> str:
    """Get the current date in ISO format."""
    from datetime import date
    return date.today().isoformat()
```

**Key points:**
- `@agent.tool` — function receives `RunContext` as first arg (for dependency injection)
- `@agent.tool_plain` — function has no dependencies, simpler signature
- Docstrings define the tool schema (description, args, returns) — LLM uses this to decide when to call
- Pydantic validates tool arguments; validation errors are sent back to LLM for retry

### Dependency Injection

Inject runtime dependencies (DB sessions, API clients, config) via `deps_type` and `RunContext`.

```python
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext
from sqlalchemy.orm import Session

@dataclass
class AnalysisDeps:
    db_session: Session
    llm_config: dict
    rate_limiter: RateLimiter

# Define agent with dependency type
analysis_agent = Agent(
    'openai:gpt-4o',
    deps_type=AnalysisDeps,
    output_type=AnalysisOutput,
    instructions='Analyze corporate signals and extract strategic insights.',
)

# Tools access dependencies via ctx.deps
@analysis_agent.tool
def fetch_company_context(ctx: RunContext[AnalysisDeps], company_id: str) -> str:
    """Fetch company profile and recent signals for context."""
    db = ctx.deps.db_session
    company = db.query(Company).get(company_id)
    return f"Company: {company.name}, Industry: {company.industry}"

# Dynamic instructions can also use dependencies
@analysis_agent.instructions
def add_rate_limit_info(ctx: RunContext[AnalysisDeps]) -> str:
    """Add rate limit status to instructions."""
    remaining = ctx.deps.rate_limiter.remaining_requests()
    return f"Rate limit: {remaining} requests remaining today."

# Run with dependencies
result = analysis_agent.run_sync(
    'Analyze this earnings call transcript...',
    deps=AnalysisDeps(
        db_session=db_session,
        llm_config={'temperature': 0.3},
        rate_limiter=rate_limiter,
    ),
)
```

**Key points:**
- `deps_type` declares what dependencies the agent expects
- `RunContext[MyDeps]` carries dependencies to tools and dynamic instructions
- Dependencies are validated at runtime (type safety)
- Pass `deps=MyDeps(...)` when calling `run()` or `run_sync()`
- Makes testing easy — inject mock dependencies

### Structured Outputs

Define output as Pydantic models. PydanticAI generates JSON schema, validates output, and retries on failure.

```python
from pydantic import BaseModel, Field

class SentimentOutput(BaseModel):
    sentiment: str = Field(description="positive, negative, or neutral")
    confidence: float = Field(description="Confidence score 0.0-1.0", ge=0.0, le=1.0)
    reasoning: str = Field(description="Brief explanation of sentiment classification")

sentiment_agent = Agent(
    'openai:gpt-4o',
    output_type=SentimentOutput,
    instructions='Classify the sentiment of corporate communications.',
)

# Output is guaranteed to be SentimentOutput (validated by Pydantic)
result = sentiment_agent.run_sync('Revenue grew 20% YoY...')
print(result.output.sentiment)  # Type-safe access
print(result.output.confidence)  # 0.85
```

**Key points:**
- `output_type` constrains LLM output to match Pydantic model
- PydanticAI generates JSON schema from model and sends to LLM
- If LLM output fails validation, PydanticAI automatically retries with error feedback
- Field descriptions help LLM understand what to return
- Use `Field(ge=0.0, le=1.0)` for range validation

### Multi-Provider Support

Use model identifier strings to switch providers without code changes.

```python
# Model identifier strings
models = {
    'openai': 'openai:gpt-4o',
    'anthropic': 'anthropic:claude-sonnet-4-5',
    'groq': 'groq:llama-3-70b',
}

# Create agent with configurable model
def create_analysis_agent(provider: str = 'openai') -> Agent:
    model_id = models[provider]
    return Agent(
        model_id,
        output_type=AnalysisOutput,
        instructions='Analyze corporate signals.',
    )

# Or switch at runtime
agent = Agent(
    'openai:gpt-4o',  # Default
    output_type=AnalysisOutput,
)

# Override model when running
result = agent.run_sync(
    'Analyze this...',
    model='anthropic:claude-sonnet-4-5',  # Override for this call
)
```

**Key points:**
- Model strings: `'provider:model-name'` format
- Supported providers: `openai`, `anthropic`, `groq`, `mistral`, `cohere`, etc.
- Set default model in `Agent()` constructor
- Override per-call with `model=` parameter in `run()`
- Makes A/B testing and fallback strategies easy

### Fallback Models

Try primary model, fallback to secondary on failure.

```python
async def run_with_fallback(agent: Agent, prompt: str) -> Any:
    """Try primary model, fallback to secondary on failure."""
    models_to_try = [
        'openai:gpt-4o',
        'anthropic:claude-sonnet-4-5',
        'groq:llama-3-70b',
    ]
    
    for model_id in models_to_try:
        try:
            result = await agent.run(prompt, model=model_id)
            return result.output
        except Exception as e:
            logger.warning(f"Model {model_id} failed: {e}")
            continue
    
    raise RuntimeError("All models failed")
```

## The Tell-Specific Patterns

### Fact Extraction Agent

```python
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from dataclasses import dataclass

class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of key facts extracted")
    entities: list[str] = Field(description="Companies, people, products mentioned")
    sentiment: str = Field(description="Overall sentiment: positive/negative/neutral")
    confidence: float = Field(description="Confidence in extraction 0.0-1.0", ge=0.0, le=1.0)

@dataclass
class ExtractionDeps:
    db_session: Session
    signal_id: str

fact_extraction_agent = Agent(
    'openai:gpt-4o',
    deps_type=ExtractionDeps,
    output_type=FactExtractionOutput,
    instructions=(
        'Extract key facts from corporate signals. '
        'Identify entities, actions, and strategic implications. '
        'Focus on concrete, verifiable information.'
    ),
)

@fact_extraction_agent.tool
def check_duplicate_facts(ctx: RunContext[ExtractionDeps], fact: str) -> bool:
    """Check if this fact was already extracted from another signal."""
    db = ctx.deps.db_session
    existing = db.query(Fact).filter(Fact.text == fact).first()
    return existing is not None

async def extract_facts(text: str, deps: ExtractionDeps) -> FactExtractionOutput:
    result = await fact_extraction_agent.run(text, deps=deps)
    return result.output
```

### Sentiment Analysis Agent

```python
class SentimentOutput(BaseModel):
    sentiment: str = Field(description="positive, negative, or neutral")
    confidence: float = Field(description="Confidence 0.0-1.0", ge=0.0, le=1.0)
    reasoning: str = Field(description="Brief explanation")
    key_phrases: list[str] = Field(description="Phrases that drove sentiment")

sentiment_agent = Agent(
    'openai:gpt-4o',
    output_type=SentimentOutput,
    instructions=(
        'Classify sentiment of corporate communications. '
        'Focus on strategic sentiment (growth, risk, uncertainty). '
        'Provide reasoning and key phrases that drove classification.'
    ),
)

async def analyze_sentiment(text: str) -> SentimentOutput:
    result = await sentiment_agent.run(text)
    return result.output
```

### Theme Detection Agent

```python
class ThemeOutput(BaseModel):
    themes: list[str] = Field(description="Strategic themes detected")
    primary_theme: str = Field(description="Most prominent theme")
    confidence: float = Field(description="Confidence in theme detection 0.0-1.0", ge=0.0, le=1.0)

theme_agent = Agent(
    'openai:gpt-4o',
    output_type=ThemeOutput,
    instructions=(
        'Detect strategic themes in corporate signals. '
        'Themes include: expansion, cost-cutting, innovation, M&A, '
        'regulatory, leadership changes, market entry/exit.'
    ),
)

async def detect_themes(text: str) -> ThemeOutput:
    result = await theme_agent.run(text)
    return result.output
```

### Confidence Scoring Agent

```python
class ConfidenceOutput(BaseModel):
    confidence_score: float = Field(description="Overall confidence 0.0-1.0", ge=0.0, le=1.0)
    factors: list[str] = Field(description="Factors that influenced confidence")
    risks: list[str] = Field(description="Risks or uncertainties")

confidence_agent = Agent(
    'openai:gpt-4o',
    output_type=ConfidenceOutput,
    instructions=(
        'Score confidence in strategic inferences. '
        'Consider: evidence quality, source reliability, '
        'corroboration, specificity, and consistency.'
    ),
)

async def score_confidence(inferences: list[str]) -> ConfidenceOutput:
    prompt = f"Score confidence in these inferences:\n" + "\n".join(inferences)
    result = await confidence_agent.run(prompt)
    return result.output
```

### Article Writer Agent

```python
class ArticleOutput(BaseModel):
    title: str = Field(description="Article headline")
    summary: str = Field(description="2-3 sentence summary")
    body: str = Field(description="Full article body in markdown")
    key_takeaways: list[str] = Field(description="3-5 key takeaways")

article_agent = Agent(
    'openai:gpt-4o',
    output_type=ArticleOutput,
    instructions=(
        'Write news-style articles from analysis results. '
        'Use journalistic tone, cite sources, provide context. '
        'Structure: headline, summary, body, key takeaways.'
    ),
)

async def write_article(analysis: AnalysisResult) -> ArticleOutput:
    prompt = f"""
    Write an article based this analysis:
    
    Company: {analysis.company_name}
    Facts: {analysis.facts}
    Sentiment: {analysis.sentiment}
    Themes: {analysis.themes}
    Confidence: {analysis.confidence}
    """
    result = await article_agent.run(prompt)
    return result.output
```

## Streaming

### Basic Streaming

```python
async def stream_analysis(text: str):
    """Stream analysis results in real-time."""
    async with analysis_agent.run_stream(text) as result:
        # Stream text output
        async for chunk in result.stream_text():
            print(chunk, end='', flush=True)
        
        # Or stream structured output
        async for partial in result.stream_output():
            print(partial)
```

### Streaming to Frontend (WebSocket)

```python
from fastapi import WebSocket

@router.websocket("/ws/analyze")
async def websocket_analyze(websocket: WebSocket):
    await websocket.accept()
    text = await websocket.receive_text()
    
    async with analysis_agent.run_stream(text) as result:
        async for chunk in result.stream_text():
            await websocket.send_text(chunk)
    
    await websocket.close()
```

### Streaming to Frontend (SSE)

```python
from fastapi.responses import StreamingResponse

@router.get("/analyze/stream")
async def stream_analyze(text: str):
    async def event_generator():
        async with analysis_agent.run_stream(text) as result:
            async for chunk in result.stream_text():
                yield f"data: {chunk}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )
```

## Observability

### Logfire Integration

PydanticAI integrates with Logfire for automatic tracing of LLM calls.

```python
import logfire
from pydantic_ai import Agent

# Configure Logfire (reads from environment)
logfire.configure()

# Instrument PydanticAI
logfire.instrument_pydantic_ai()

# All agent runs are now traced automatically
agent = Agent('openai:gpt-4o', output_type=MyOutput)
result = agent.run_sync('Analyze this...')

# Logfire dashboard shows:
# - Model used
# - Tokens (prompt + completion)
# - Latency
# - Validation retries
# - Tool calls
# - Full prompt/response
```

### What Gets Traced

- Model name and provider
- Token usage (prompt tokens, completion tokens, total)
- Latency (time to first token, total time)
- Validation retries (how many times output validation failed)
- Tool calls (which tools were called, arguments, results)
- Full prompt and response (for debugging)

### Custom Spans

```python
import logfire

@logfire.instrument("Analyzing signal {signal_id}")
async def analyze_signal(signal_id: str, text: str):
    result = await analysis_agent.run(text)
    return result.output
```

## Testing Patterns

### Mock Model Responses

```python
from pydantic_ai.models.test import TestModel

# TestModel returns deterministic output for testing
test_model = TestModel(
    custom_output=FactExtractionOutput(
        facts=["Revenue grew 20%"],
        entities=["Company X"],
        sentiment="positive",
        confidence=0.9,
    )
)

# Use test model instead of real model
agent = Agent(
    test_model,  # TestModel instead of 'openai:gpt-4o'
    output_type=FactExtractionOutput,
)

result = agent.run_sync('Test input')
assert result.output.facts == ["Revenue grew 20%"]
```

### Inject Test Dependencies

```python
from unittest.mock import MagicMock

def test_fact_extraction():
    # Mock database session
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    
    deps = ExtractionDeps(
        db_session=mock_db,
        signal_id="test-123",
    )
    
    # Use TestModel for deterministic output
    test_model = TestModel(
        custom_output=FactExtractionOutput(
            facts=["Test fact"],
            entities=["Test Co"],
            sentiment="neutral",
            confidence=0.8,
        )
    )
    
    agent = Agent(
        test_model,
        deps_type=ExtractionDeps,
        output_type=FactExtractionOutput,
    )
    
    result = agent.run_sync('Test input', deps=deps)
    
    assert result.output.facts == ["Test fact"]
    assert result.output.confidence == 0.8
```

### Snapshot Testing

```python
from syrupy.assertion import SnapshotAssertion

def test_sentiment_analysis(snapshot: SnapshotAssertion):
    result = sentiment_agent.run_sync('Revenue grew 20%...')
    
    # Snapshot the entire output
    assert result.output == snapshot

# First run creates snapshot, subsequent runs compare
# Update snapshots: pytest --snapshot-update
```

## Common Mistakes

### Mistake 1: Not Defining `output_type`

**Bad:**
```python
# No output_type — returns raw string
agent = Agent('openai:gpt-4o', instructions='Extract facts...')
result = agent.run_sync('Text...')
# result.output is a string — no type safety
```

**Good:**
```python
# Define output_type — returns validated Pydantic model
agent = Agent(
    'openai:gpt-4o',
    output_type=FactExtractionOutput,
    instructions='Extract facts...',
)
result = agent.run_sync('Text...')
# result.output is FactExtractionOutput — type-safe
```

**Why:** Without `output_type`, you lose type safety and validation. You must manually parse JSON and handle errors.

### Mistake 2: Hardcoding Provider

**Bad:**
```python
# Hardcoded to OpenAI
import openai
client = openai.AsyncOpenAI()
response = await client.chat.completions.create(model='gpt-4o', ...)
```

**Good:**
```python
# Use model identifier string
agent = Agent('openai:gpt-4o', output_type=MyOutput)
# Can switch to 'anthropic:claude-sonnet-4-5' without code changes
```

**Why:** Hardcoding prevents provider switching, A/B testing, and fallback strategies.

### Mistake 3: Not Using Dependency Injection

**Bad:**
```python
# Global database connection
db = Session()

@agent.tool
def fetch_data(query: str) -> str:
    return db.execute(query)  # Hard to test, tightly coupled
```

**Good:**
```python
@dataclass
class MyDeps:
    db: Session

agent = Agent('openai:gpt-4o', deps_type=MyDeps)

@agent.tool
def fetch_data(ctx: RunContext[MyDeps], query: str) -> str:
    return ctx.deps.db.execute(query)  # Injectable, testable

# Inject at runtime
result = agent.run_sync('Query', deps=MyDeps(db=mock_db))
```

**Why:** Global state makes testing hard, creates tight coupling, and reduces reusability.

### Mistake 4: Ignoring Validation Retries

**Bad:**
```python
# No logging of retries
result = agent.run_sync('Input')
# Don't know if validation failed and retried
```

**Good:**
```python
# Log retries for debugging
result = agent.run_sync('Input')
if result.usage().retries > 0:
    logger.warning(f"Validation retried {result.usage().retries} times")
```

**Why:** Validation retries are automatic, but you should log them to identify output schema issues or LLM confusion.

## Quick Reference

| Pattern | Code |
|---------|------|
| **Agent definition** | `Agent('openai:gpt-4o', output_type=MyOutput, instructions='...')` |
| **Tool registration** | `@agent.tool` with `RunContext[Deps]` |
| **Plain tool** | `@agent.tool_plain` (no dependencies) |
| **Dependency injection** | `deps_type=MyDeps`, pass `deps=MyDeps(...)` to `run()` |
| **Access dependencies** | `ctx.deps.field_name` in tools/instructions |
| **Multi-provider** | Use model strings: `'openai:gpt-4o'`, `'anthropic:claude-sonnet-4-5'` |
| **Override model** | `agent.run(prompt, model='anthropic:claude-sonnet-4-5')` |
| **Streaming** | `async with agent.run_stream() as result: async for chunk in result.stream_text()` |
| **Test model** | `TestModel(custom_output=MyOutput(...))` |
| **Observability** | `logfire.instrument_pydantic_ai()` |

## Installation

```bash
pip install pydantic-ai
pip install logfire  # For observability
```

## Related Skills

- **llm-abstraction** — Lower-level LLM provider abstraction (use PydanticAI instead for agents)
- **signal-analysis** — Analysis pipeline patterns (use PydanticAI agents for LLM nodes)
- **data-modeling** — Pydantic model design (applies to `output_type` models)

## Resources

- [PydanticAI Documentation](https://ai.pydantic.dev/)
- [PydanticAI GitHub](https://github.com/pydantic/pydantic-ai)
- [Logfire Documentation](https://logfire.pydantic.dev/)
