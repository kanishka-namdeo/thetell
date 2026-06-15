---
name: llm-abstraction
description: Use when integrating LLM-powered features, supporting multiple LLM providers (OpenAI, Anthropic, etc.), or implementing prompt templating and structured output parsing
---

# LLM Abstraction

## Overview

Use **PydanticAI** as the LLM abstraction layer. It provides multi-provider support, guaranteed structured outputs with auto-retry, dependency injection, and observability — replacing the need for hand-rolled provider classes.

**Do not** write custom `LLMProvider` Protocol classes or factory functions. PydanticAI handles all of this natively.

## When to Use

- Any LLM-powered feature (analysis, generation, extraction)
- When you need structured, validated outputs from LLMs
- When you need to support multiple LLM providers
- When you need dependency injection for DB sessions, config, or API clients
- When you need cost tracking or observability
- When you need prompt templating (combine with Jinja2)

## Core Pattern: PydanticAI Agents

### Agent Definition

```python
from pydantic_ai import Agent
from pydantic import BaseModel, Field

class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of extracted facts")
    entities: list[str] = Field(description="Mentioned entities")
    sentiment: str = Field(description="Overall sentiment: positive/negative/neutral")

# Model identifier string — switch providers without code changes
fact_agent = Agent(
    'openai:gpt-4o',
    output_type=FactExtractionOutput,
    instructions='Extract key facts from corporate signals. Identify entities and strategic implications.',
)

# Output is guaranteed FactExtractionOutput (validated by Pydantic)
result = fact_agent.run_sync('Revenue grew 20% YoY with expanding margins...')
print(result.output.facts)       # Type-safe access
print(result.output.sentiment)   # "positive"
```

**Key points:**
- Model strings: `'openai:gpt-4o'`, `'anthropic:claude-sonnet-4-5'`, `'groq:llama-3-70b'`
- `output_type` guarantees the return type — no manual JSON parsing
- PydanticAI auto-retries when LLM output fails schema validation
- `instructions` is the system prompt (static string or dynamic function)

### Multi-Provider Support

```python
# Configurable model via constructor
def create_analysis_agent(provider: str = 'openai') -> Agent:
    models = {
        'openai': 'openai:gpt-4o',
        'anthropic': 'anthropic:claude-sonnet-4-5',
        'groq': 'groq:llama-3-70b',
    }
    return Agent(
        models[provider],
        output_type=AnalysisOutput,
        instructions='Analyze corporate signals.',
    )

# Override model per-call
result = await agent.run('Analyze...', model='anthropic:claude-sonnet-4-5')
```

### Structured Outputs with Auto-Retry

```python
class SentimentOutput(BaseModel):
    sentiment: str = Field(description="positive, negative, or neutral")
    confidence: float = Field(description="Confidence 0.0-1.0", ge=0.0, le=1.0)
    reasoning: str = Field(description="Brief explanation")

sentiment_agent = Agent(
    'openai:gpt-4o',
    output_type=SentimentOutput,
    instructions='Classify sentiment of corporate communications.',
)

# If LLM returns invalid JSON or confidence=1.5, PydanticAI
# automatically retries with the validation error as feedback
result = sentiment_agent.run_sync('Revenue grew 20% YoY...')
# result.output is guaranteed valid SentimentOutput

# Log retries for debugging
if result.usage().retries > 0:
    logger.warning(f"Validation retried {result.usage().retries} times")
```

### Dependency Injection via RunContext

```python
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext
from sqlalchemy.orm import Session

@dataclass
class AnalysisDeps:
    db_session: Session
    rate_limiter: RateLimiter

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
    company = ctx.deps.db_session.query(Company).get(company_id)
    return f"Company: {company.name}, Industry: {company.industry}"

# Dynamic instructions can also use dependencies
@analysis_agent.instructions
def add_rate_limit_info(ctx: RunContext[AnalysisDeps]) -> str:
    remaining = ctx.deps.rate_limiter.remaining_requests()
    return f"Rate limit: {remaining} requests remaining today."

# Run with injected dependencies
result = analysis_agent.run_sync(
    'Analyze this earnings call transcript...',
    deps=AnalysisDeps(db_session=db_session, rate_limiter=rate_limiter),
)
```

### Fallback Models

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

## Cost Tracking via Logfire

```python
import logfire

# Configure Logfire (reads LOGFIRE_TOKEN from environment)
logfire.configure()

# Instrument PydanticAI — all agent runs are traced automatically
logfire.instrument_pydantic_ai()

# Logfire dashboard shows per-call:
# - Model and provider
# - Token usage (prompt, completion, total)
# - Latency (time to first token, total time)
# - Validation retries
# - Tool calls with arguments and results
# - Full prompt/response for debugging
```

## Prompt Templating with Jinja2

Jinja2 templates remain useful for complex prompt construction. Combine with PydanticAI agents:

```python
from jinja2 import Template

EXTRACT_FACTS_PROMPT = Template("""
Extract key facts from the following corporate signal.

Signal type: {{ signal_type }}
Source: {{ source }}

Text:
{{ text }}

Return structured output with:
- facts: list of key facts
- entities: list of mentioned entities
- sentiment: overall sentiment (positive/negative/neutral)
""")

async def extract_facts(text: str, signal_type: str, source: str) -> FactExtractionOutput:
    prompt = EXTRACT_FACTS_PROMPT.render(
        text=text, signal_type=signal_type, source=source
    )
    result = await fact_agent.run(prompt)
    return result.output
```

## Migration from Legacy Provider Pattern

If you have existing code using the old `LLMProvider` Protocol pattern from `backend/app/llm/provider.py`:

### Before (Legacy)

```python
# Old pattern — DO NOT use this anymore
class LLMProvider(Protocol):
    async def complete(self, prompt: str) -> str: ...
    async def complete_structured(self, prompt: str, response_model: type[BaseModel]) -> BaseModel: ...

llm = get_llm_provider()
result = await llm.complete_structured(prompt, FactsResponse)
```

### After (PydanticAI)

```python
# New pattern — use PydanticAI agents
from pydantic_ai import Agent

fact_agent = Agent(
    'openai:gpt-4o',              # Replaces get_llm_provider()
    output_type=FactsResponse,     # Replaces complete_structured()
    instructions='Extract key facts from corporate signals.',
)

# Usage — output_type guarantees validated FactsResponse
result = await fact_agent.run(text)
facts = result.output  # FactsResponse — type-safe, validated
```

### Migration Checklist

| Old Pattern | New Pattern |
|---|---|
| `LLMProvider` Protocol | `Agent(model, output_type=...)` |
| `OpenAIProvider` / `AnthropicProvider` classes | Model strings: `'openai:gpt-4o'`, `'anthropic:claude-sonnet-4-5'` |
| `get_llm_provider()` factory | Pass model string to `Agent()` or override with `run(model=...)` |
| `complete(prompt)` | `agent.run(prompt)` → `result.output` (string) |
| `complete_structured(prompt, Model)` | `Agent(output_type=Model)` → `result.output` (validated Model) |
| Manual JSON parsing + error handling | Automatic with `output_type` + auto-retry |
| Custom `LLMProviderError` hierarchy | PydanticAI exceptions + `ModelRetry` for validation |
| Manual DI (passing `llm` around) | `deps_type` + `RunContext[Deps]` |
| Manual token counting | `logfire.instrument_pydantic_ai()` |
| Manual cost tracking | Logfire traces token usage per call |

## Common Mistakes

### Mistake 1: Not Defining `output_type`

**Bad:**
```python
agent = Agent('openai:gpt-4o', instructions='Extract facts...')
result = agent.run_sync('Text...')
# result.output is a raw string — must manually parse JSON
```

**Good:**
```python
agent = Agent('openai:gpt-4o', output_type=FactExtractionOutput, instructions='Extract facts...')
result = agent.run_sync('Text...')
# result.output is FactExtractionOutput — type-safe, validated
```

### Mistake 2: Writing Custom Provider Classes or Manual Parsing

**Bad:**
```python
class MyOpenAIProvider:
    async def complete(self, prompt): ...
    async def complete_structured(self, prompt, model): ...

response = await llm.complete(prompt)
data = json.loads(response)  # May fail, no retry
result = MyModel(**data)
```

**Good:**
```python
agent = Agent('openai:gpt-4o', output_type=MyModel)
result = await agent.run(prompt)  # validated MyModel, auto-retry
# Switch provider: Agent('anthropic:claude-sonnet-4-5', output_type=MyModel)
```

### Mistake 4: Ignoring Rate Limits

```python
# Bad: No concurrency control
results = [await agent.run(t) for t in texts]  # Rapid fire!

# Good: Semaphore for concurrency control
semaphore = asyncio.Semaphore(5)
async def limited_run(text):
    async with semaphore:
        return await agent.run(text)
results = await asyncio.gather(*[limited_run(t) for t in texts])
```

## Quick Reference

| Pattern | Code |
|---|---|
| **Agent definition** | `Agent('openai:gpt-4o', output_type=MyOutput, instructions='...')` |
| **Multi-provider** | Model strings: `'openai:gpt-4o'`, `'anthropic:claude-sonnet-4-5'` |
| **Override model** | `agent.run(prompt, model='anthropic:claude-sonnet-4-5')` |
| **Structured output** | `output_type=MyPydanticModel` (auto-validates, auto-retries) |
| **Dependency injection** | `deps_type=MyDeps`, pass `deps=MyDeps(...)` to `run()` |
| **Access deps in tools** | `ctx.deps.field_name` via `RunContext[MyDeps]` |
| **Cost tracking** | `logfire.instrument_pydantic_ai()` |
| **Test model** | `TestModel(custom_output=MyOutput(...))` |
| **Prompt templates** | Jinja2 `Template` → render → pass to `agent.run()` |
| **Fallback** | Loop over model strings with try/except |

## Related Skills

- **pydanticai-agents** — Full PydanticAI patterns (tools, streaming, testing, The Tell-specific agents)
- **signal-analysis** — Analysis pipeline patterns (use PydanticAI agents for LLM nodes)
- **data-modeling** — Pydantic model design (applies to `output_type` models)
- **llm-abstraction** — This skill (provider abstraction + migration)

## Resources

- [PydanticAI Documentation](https://ai.pydantic.dev/)
- [PydanticAI GitHub](https://github.com/pydantic/pydantic-ai)
- [Logfire Documentation](https://logfire.pydantic.dev/)
