---
name: data-modeling
description: Use when designing new data structures, creating Pydantic models for the backend, defining TypeScript types for the frontend, defining PydanticAI output_type models, designing LangGraph state TypedDicts, or managing data transformations between layers
---

# Data Modeling

## Overview

Use **Pydantic models** for the backend and **TypeScript types** for the frontend. Layer models from raw to processed to published, with strict validation at each stage. For LLM-powered agents, use **PydanticAI output_type models** to guarantee structured outputs. For multi-step workflows, use **LangGraph state TypedDicts** with reducers to manage data flow through the graph.

## When to Use

- Creating any new data structure (Pydantic models, TypeScript types)
- Designing database schemas or API request/response schemas
- Defining PydanticAI `output_type` models for agent outputs
- Designing LangGraph state TypedDicts with reducers
- Transforming data between pipeline stages (agent output → graph state → API → frontend)
- When frontend and backend need to share type definitions

## Core Pattern: Layered Pydantic Models

### Before: Flat, Unvalidated Models (Problematic)

```python
# Bad: Flat dict with no validation
def process_signal(data: dict) -> dict:
    return {
        "id": data.get("id"),
        "text": data.get("text"),
        "analysis": data.get("analysis"),
        # No validation, no types, easy to miss fields
    }
```

```typescript
// Bad: Any types, no structure
type Signal = any;
```

### After: Layered Pydantic Models + TypeScript Types

```python
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

class SignalType(str, Enum):
    FINANCIAL = "financial"
    OPERATIONAL = "operational"
    STRATEGIC = "strategic"
    CULTURAL = "cultural"

class Fact(BaseModel):
    statement: str
    source_text: str
    confidence: float = Field(ge=0.0, le=1.0)

class Analysis(BaseModel):
    facts: list[Fact]
    signal_type: SignalType
    implications: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)

class Signal(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    source_url: str
    source_type: str
    raw_text: str
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    analysis: Analysis | None = None

    @field_validator("source_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL: {v}")
        return v

class PublishedArticle(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    signal_id: UUID
    headline: str
    lead_paragraph: str
    body: str
    sources: list[str]
    published_at: datetime = Field(default_factory=datetime.utcnow)
```

```typescript
// Frontend: TypeScript types mirroring backend
type SignalType = "financial" | "operational" | "strategic" | "cultural";

interface Fact {
  statement: string;
  sourceText: string;
  confidence: number;
}

interface Analysis {
  facts: Fact[];
  signalType: SignalType;
  implications: string[];
  confidence: number;
  analyzedAt: string;
}

interface Signal {
  id: string;
  sourceUrl: string;
  sourceType: string;
  rawText: string;
  scrapedAt: string;
  analysis?: Analysis;
}

interface PublishedArticle {
  id: string;
  signalId: string;
  headline: string;
  leadParagraph: string;
  body: string;
  sources: string[];
  publishedAt: string;
}
```

## PydanticAI Output Types

Define `output_type` models for each agent. These are Pydantic models with `Field()` descriptions that guide the LLM to produce structured, validated outputs.

### Pattern

```python
from pydantic import BaseModel, Field
from pydantic_ai import Agent

class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of key facts extracted from the signal")
    entities: list[str] = Field(description="Companies, people, products mentioned")
    sentiment: str = Field(description="Overall sentiment: positive, negative, or neutral")
    confidence: float = Field(
        description="Confidence in extraction accuracy, 0.0-1.0",
        ge=0.0, le=1.0
    )

fact_agent = Agent(
    'openai:gpt-4o',
    output_type=FactExtractionOutput,
    instructions='Extract key facts from corporate signals.',
)

# Output is guaranteed to be FactExtractionOutput (validated by Pydantic)
result = fact_agent.run_sync('Company X reported 20% revenue growth...')
print(result.output.facts)  # Type-safe access
```

### Key Principles

- **Every agent needs an `output_type`** — without it, you get raw strings with no type safety
- **Use `Field(description=...)`** — descriptions guide the LLM on what to return
- **Use validation constraints** — `Field(ge=0.0, le=1.0)` for ranges, `Field(min_length=1)` for lists
- **Keep output models focused** — one model per agent, not a catch-all
- **Nest models for complex outputs** — break large outputs into sub-models

### Common Output Models

```python
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

class ArticleOutput(BaseModel):
    title: str = Field(description="Article headline")
    summary: str = Field(description="2-3 sentence summary")
    body: str = Field(description="Full article body in markdown")
    key_takeaways: list[str] = Field(description="3-5 key takeaways")
```

## LangGraph State Models

Use `TypedDict` with `Annotated` reducers for graph state. Every list field needs an append reducer.

### Pattern

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class Fact(TypedDict):
    statement: str
    confidence: float
    source_url: str

class SignalAnalysisState(TypedDict):
    # Input fields
    signal_id: str
    raw_text: str
    company_id: str
    
    # Intermediate fields — use Annotated reducers for lists
    facts: Annotated[list[Fact], lambda a, b: a + b]
    sentiment: str
    themes: list[str]
    
    # Output fields
    confidence_score: float
    summary: str
    
    # Control fields
    error: str | None
    messages: Annotated[list[BaseMessage], add_messages]
```

### Key Principles

- **Use `TypedDict`, not Pydantic** — LangGraph state is a dict, not a validated model
- **Every list field needs a reducer** — `Annotated[list[T], lambda a, b: a + b]` for appending
- **Use `add_messages` for message lists** — handles message deduplication and ordering
- **Separate input, intermediate, and output fields** — makes data flow clear
- **Include control fields** — `error: str | None` for error handling

### Common State Models

```python
class InferenceState(TypedDict):
    signal_ids: list[str]
    signal_texts: Annotated[list[str], lambda a, b: a + b]
    patterns: Annotated[list[dict], lambda a, b: a + b]
    iteration: int
    final_inference: str

class ArticleState(TypedDict):
    signal_id: str
    analysis: dict
    headline: str
    summary: str
    body: str
    approved: bool
    messages: Annotated[list[BaseMessage], add_messages]
```

## Bridging PydanticAI Outputs into LangGraph State

PydanticAI agent outputs flow into LangGraph graph state. Nodes call agents, then map validated outputs to state fields.

### Pattern

```python
from pydantic_ai import Agent
from pydantic import BaseModel, Field
from typing import TypedDict, Annotated

# 1. Define PydanticAI output model
class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of key facts")
    entities: list[str] = Field(description="Entities mentioned")
    confidence: float = Field(description="Confidence 0.0-1.0", ge=0.0, le=1.0)

# 2. Define LangGraph state
class SignalAnalysisState(TypedDict):
    signal_id: str
    raw_text: str
    facts: Annotated[list[str], lambda a, b: a + b]
    entities: Annotated[list[str], lambda a, b: a + b]
    fact_confidence: float

# 3. Define agent
fact_agent = Agent(
    'openai:gpt-4o',
    output_type=FactExtractionOutput,
    instructions='Extract key facts from corporate signals.',
)

# 4. Node function bridges agent output to state
async def extract_facts_node(state: SignalAnalysisState) -> dict:
    # Call PydanticAI agent
    result = fact_agent.run_sync(state['raw_text'])
    
    # Map validated output to state fields
    return {
        "facts": result.output.facts,
        "entities": result.output.entities,
        "fact_confidence": result.output.confidence,
    }
```

### Key Principles

- **Nodes return partial state dicts** — only the fields they update
- **PydanticAI guarantees output structure** — `result.output` is validated
- **Map output fields to state fields** — explicit mapping, not implicit
- **Handle errors gracefully** — catch agent failures, set `error` field
- **Use reducers for lists** — state accumulates facts across multiple nodes

### Error Handling

```python
async def extract_facts_node(state: SignalAnalysisState) -> dict:
    try:
        result = await fact_agent.run(state['raw_text'])
        return {
            "facts": result.output.facts,
            "entities": result.output.entities,
            "fact_confidence": result.output.confidence,
        }
    except Exception as e:
        # Set error field, don't crash the graph
        return {"error": f"Fact extraction failed: {str(e)}"}
```

## Cross-Layer Data Flow

Data flows through four layers: PydanticAI agent output → LangGraph state → API response schema → frontend TypeScript types. Each layer has its own model type, with explicit transformations between layers.

### Flow Diagram

```
PydanticAI Output     LangGraph State      API Response         Frontend Type
(Pydantic Model)  →   (TypedDict)      →   (Pydantic Model) →   (TypeScript)
                    
FactExtractionOutput  SignalAnalysisState  SignalResponse        Signal
- facts: list[str]    - facts: list[str]   - facts: list[str]    - facts: string[]
- confidence: float   - fact_confidence    - confidence: float   - confidence: number
```

### Layer 1: PydanticAI Output (Agent Level)

```python
class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="List of key facts")
    confidence: float = Field(description="Confidence 0.0-1.0", ge=0.0, le=1.0)
```

### Layer 2: LangGraph State (Workflow Level)

```python
class SignalAnalysisState(TypedDict):
    facts: Annotated[list[str], lambda a, b: a + b]
    fact_confidence: float
```

### Layer 3: API Response (Service Level)

```python
from pydantic import BaseModel

class SignalResponse(BaseModel):
    id: str
    facts: list[str]
    confidence: float
    analyzed_at: datetime
    
    model_config = {"from_attributes": True}
```

### Layer 4: Frontend Type (UI Level)

```typescript
interface Signal {
  id: string;
  facts: string[];
  confidence: number;
  analyzedAt: string;
}
```

### Transformation Between Layers

```python
# Node: PydanticAI output → LangGraph state
async def extract_facts_node(state: SignalAnalysisState) -> dict:
    result = await fact_agent.run(state['raw_text'])
    return {
        "facts": result.output.facts,
        "fact_confidence": result.output.confidence,
    }

# API endpoint: LangGraph state → API response
@router.get("/signals/{signal_id}")
async def get_signal(signal_id: str):
    state = await app.ainvoke({"signal_id": signal_id})
    return SignalResponse(
        id=signal_id,
        facts=state["facts"],
        confidence=state["fact_confidence"],
        analyzed_at=datetime.utcnow(),
    )
```

```typescript
// Frontend: API response → TypeScript type
async function fetchSignal(signalId: string): Promise<Signal> {
  const res = await fetch(`/api/signals/${signalId}`);
  return res.json(); // Maps to Signal interface
}
```

### Keeping Layers in Sync

- **Use `pydantic2ts`** to generate TypeScript from Pydantic models
- **Name models consistently** — `SignalResponse` (backend) → `Signal` (frontend)
- **Use the same field names** — `confidence` in Python, `confidence` in TypeScript (not `confidenceScore`)
- **Document transformations** — comment where data shape changes between layers

## Quick Reference

| Aspect | Rule |
|--------|------|
| **Model layering** | Raw → Processed → Published |
| **Validation** | Pydantic validators on every model |
| **PydanticAI outputs** | `output_type=MyOutput` with `Field(description=...)` |
| **LangGraph state** | `TypedDict` with `Annotated` reducers for lists |
| **Bridging** | Nodes map agent outputs to state fields explicitly |
| **Cross-layer sync** | Use `pydantic2ts`, consistent naming, document transformations |
| **Enums** | Use for finite sets (signal types, status) |
| **IDs** | UUID, auto-generated |
| **Timestamps** | UTC, with `default_factory` |
| **Optionals** | Use `\| None` for fields that may be absent |

### Model Layering

```
RawSignal          Analysis           PublishedArticle
(source data)  →  (processed)    →  (output)
- source_url       - facts              - headline
- raw_text         - signal_type        - lead_paragraph
- scraped_at       - implications       - body
                   - confidence         - sources
```

### Validation Patterns

```python
from pydantic import BaseModel, field_validator

class Signal(BaseModel):
    source_url: str
    raw_text: str

    @field_validator("raw_text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("raw_text must not be empty")
        return v.strip()

    @field_validator("source_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL scheme: {v}")
        return v
```

## Common Mistakes

### Mistake 1: No validation

**Problem:** Garbage data flows through the pipeline.

```python
# Bad: No validation
class Signal(BaseModel):
    url: str
    text: str

# Good: Validate everything
class Signal(BaseModel):
    source_url: str
    raw_text: str

    @field_validator("source_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL: {v}")
        return v
```

### Mistake 2: Flat models

**Problem:** Hard to evolve, mixes concerns.

```python
# Bad: Everything in one model
class Signal(BaseModel):
    id: UUID
    source_url: str
    raw_text: str
    facts: list[str]
    signal_type: str
    implications: list[str]
    confidence: float
    headline: str
    body: str

# Good: Layered models
class Signal(BaseModel):
    id: UUID
    source_url: str
    raw_text: str
    analysis: Analysis | None = None

class Analysis(BaseModel):
    facts: list[Fact]
    signal_type: SignalType
    implications: list[str]
    confidence: float
```

### Mistake 3: Manual type sync

**Problem:** Backend and frontend types drift apart.

```powershell
# Good: Auto-generate TypeScript from Pydantic
.venv\Scripts\pip.exe install pydantic2ts
.venv\Scripts\pydantic2ts.exe --module app.models --output ../frontend/src/types/models.ts
```

### Mistake 4: Using dicts instead of models

**Problem:** No autocomplete, no validation, no documentation.

```python
# Bad: Dicts everywhere
def process(data: dict) -> dict:
    return {"result": data["text"].upper()}

# Good: Pydantic models
class ProcessInput(BaseModel):
    text: str

class ProcessOutput(BaseModel):
    result: str

def process(data: ProcessInput) -> ProcessOutput:
    return ProcessOutput(result=data.text.upper())
```

### Mistake 5: Missing reducer on list fields

**Problem:** LangGraph overwrites lists instead of appending.

```python
# Bad — no reducer, list gets overwritten
class MyState(TypedDict):
    facts: list[str]

# Good — reducer appends
class MyState(TypedDict):
    facts: Annotated[list[str], lambda a, b: a + b]
```

### Mistake 6: Not defining `output_type` for agents

**Problem:** No type safety, manual JSON parsing.

```python
# Bad — returns raw string
agent = Agent('openai:gpt-4o', instructions='Extract facts...')
result = agent.run_sync('Text...')
# result.output is a string

# Good — returns validated model
agent = Agent('openai:gpt-4o', output_type=FactExtractionOutput, instructions='...')
result = agent.run_sync('Text...')
# result.output is FactExtractionOutput
```

## Tools

- **Pydantic** — Data validation and settings management
- **PydanticAI** — Structured LLM outputs with `output_type`
- **LangGraph** — State machine orchestration with `TypedDict` state
- **pydantic2ts** — Generate TypeScript from Pydantic models
- **Alembic** — Database migrations from SQLAlchemy models
- **SQLAlchemy** — ORM for database models
- **datamodel-code-generator** — Generate models from JSON Schema, OpenAPI

## Related Skills

- **pydanticai-agents** — PydanticAI agent patterns, dependency injection, streaming
- **langgraph-orchestration** — LangGraph graph compilation, checkpointing, streaming
- **signal-analysis** — Analysis pipeline patterns
- **llm-abstraction** — Lower-level LLM provider abstraction
