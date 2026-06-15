---
name: testing-strategies
description: Use when writing tests for any component, especially for scraping, LLM integration, LangGraph graphs, PydanticAI agents, or analysis pipeline; when dealing with non-deterministic systems or external dependencies
---

# Testing Strategies

## Overview

Test non-deterministic systems (LLM outputs, web scraping, analysis pipelines, LangGraph workflows, PydanticAI agents) reliably by mocking external dependencies, testing pure functions, and using snapshot testing for output format validation. The key is separating logic testing from integration testing.

## When to Use

- Writing tests for web scraping code
- Testing LLM-powered features
- Building tests for the analysis pipeline
- Testing LangGraph graph routing, state flow, and checkpointing
- Testing PydanticAI agents with `TestModel`, dependency injection, and `output_type` validation
- Integration testing hybrid LangGraph + PydanticAI workflows
- Any component with external dependencies (HTTP, APIs, databases)
- Testing non-deterministic outputs
- Scenarios where tests could be slow, expensive, or flaky

## Core Pattern

### Scraping Tests

Mock HTTP responses, test parsing logic in isolation.

```python
# Before: Testing against live sites (slow, flaky, expensive)
def test_scrape_article():
    result = scrape_article("https://example.com/article")  # Live HTTP call
    assert result.title == "Expected Title"

# After: Mock HTTP, test parsing
@pytest.fixture
def mock_response():
    html = """
    <html>
        <head><title>Test Article</title></head>
        <body><p>Article content here</p></body>
    </html>
    """
    return httpx.Response(200, text=html)

def test_parse_article(mock_response):
    result = parse_article(mock_response)
    assert result.title == "Test Article"
    assert "Article content" in result.body
```

### LLM Tests

Mock LLM responses, test prompt construction and response parsing.

```python
# Test prompt construction
def test_extract_facts_prompt():
    sample_text = "Apple announced new iPhone features."
    prompt = build_extract_prompt(sample_text)

    assert "Extract key facts" in prompt
    assert sample_text in prompt
    assert "who, what, when" in prompt.lower()

# Test response parsing
@pytest.mark.asyncio
async def test_extract_facts_parsing():
    mock_response = """
    {
        "facts": [
            {"who": "Apple", "what": "announced iPhone", "when": "2024-01-15"},
            {"who": "Apple", "what": "new features", "when": "2024-01-15"},
            {"who": "Apple", "what": "product launch", "when": "2024-01-15"}
        ]
    }
    """

    result = parse_extract_response(mock_response)
    assert len(result.facts) == 3
    assert result.facts[0].who == "Apple"
```

### Analysis Tests

Test inference logic with fixed inputs.

```python
def test_classify_financial_signal():
    facts = [
        Fact(who="Company X", what="reported revenue growth", when="2024-01-01"),
        Fact(who="Company X", what="increased profit margins", when="2024-01-01"),
    ]

    signal_type = classify_signal(facts)
    assert signal_type == SignalType.FINANCIAL

def test_confidence_scoring():
    facts = [
        Fact(who="A", what="B", source_url="https://sec.gov/filing"),
        Fact(who="A", what="C", source_url="https://sec.gov/filing"),
    ]
    implications = ["Implication 1", "Implication 2"]

    confidence = score_confidence(facts, implications)
    assert 0.0 <= confidence <= 1.0
    assert confidence > 0.5  # Multiple facts, official source
```

## Testing LangGraph Graphs

### Test Conditional Routing as Pure Functions

Router functions are pure — test them directly without graph invocation.

```python
def test_route_by_confidence_publish():
    state = SignalAnalysisState(
        signal_id="s1", raw_text="...", company_id="c1",
        facts=[], sentiment="positive", themes=[],
        confidence_score=0.9, summary="Strong growth", error=None,
    )
    assert route_by_confidence(state) == "publish"

def test_route_by_confidence_review():
    state = SignalAnalysisState(
        signal_id="s1", raw_text="...", company_id="c1",
        facts=[], sentiment="neutral", themes=[],
        confidence_score=0.5, summary="", error=None,
    )
    assert route_by_confidence(state) == "review"

def test_route_by_confidence_dead_letter():
    state = SignalAnalysisState(
        signal_id="s1", raw_text="...", company_id="c1",
        facts=[], sentiment="", themes=[],
        confidence_score=0.0, summary="", error="LLM timeout",
    )
    assert route_by_confidence(state) == "dead_letter"
```

### Test Graph with Mock State via `graph.invoke()`

Compile with no checkpointer, invoke with a minimal state dict, and mock node internals.

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

@pytest.fixture
def compiled_graph():
    """Build a testable compiled graph."""
    graph = StateGraph(SignalAnalysisState)
    graph.add_node("extract_facts", extract_facts)
    graph.add_node("classify_sentiment", classify_sentiment)
    graph.add_node("score_confidence", score_confidence)
    graph.add_edge(START, "extract_facts")
    graph.add_edge("extract_facts", "classify_sentiment")
    graph.add_edge("classify_sentiment", "score_confidence")
    graph.add_edge("score_confidence", END)
    return graph.compile()

@pytest.mark.asyncio
async def test_graph_end_to_end(compiled_graph):
    with patch("app.nodes.extract_facts.get_llm_provider") as mock_llm:
        mock_llm.return_value.complete_structured.return_value = FactList(
            facts=[Fact(statement="Revenue up 20%", confidence=0.9, source_url="https://sec.gov")]
        )
        mock_llm.return_value.complete.return_value = "positive"

        result = await compiled_graph.ainvoke({
            "signal_id": "test-1",
            "raw_text": "Revenue grew 20% YoY.",
            "company_id": "co-1",
        })

    assert len(result["facts"]) == 1
    assert result["sentiment"] == "positive"
```

### Test Checkpointing with `MemorySaver`

Use in-memory `MemorySaver` instead of PostgreSQL for unit tests.

```python
from langgraph.checkpoint.memory import MemorySaver

@pytest.fixture
def graph_with_checkpointer():
    graph = StateGraph(SignalAnalysisState)
    # ... add nodes and edges ...
    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)

@pytest.mark.asyncio
async def test_checkpoint_recovery(graph_with_checkpointer):
    config = {"configurable": {"thread_id": "test-thread-1"}}

    # First run — simulate partial completion
    with patch("app.nodes.extract_facts.get_llm_provider", side_effect=LLMError("timeout")):
        with pytest.raises(LLMError):
            await graph_with_checkpointer.ainvoke(
                {"signal_id": "s1", "raw_text": "...", "company_id": "c1"},
                config=config,
            )

    # Verify checkpoint was saved
    state = await graph_with_checkpointer.aget_state(config)
    assert state is not None

    # Resume after fixing the issue
    with patch("app.nodes.extract_facts.get_llm_provider") as mock_llm:
        mock_llm.return_value.complete_structured.return_value = FactList(facts=[...])
        result = await graph_with_checkpointer.ainvoke(None, config=config)
    assert result["facts"] is not None
```

### Test Node Functions in Isolation

Nodes are async functions — test them directly with mock state dicts.

```python
@pytest.mark.asyncio
async def test_extract_facts_node():
    state = {"raw_text": "Revenue grew 20% YoY.", "signal_id": "s1", "company_id": "c1"}
    with patch("app.nodes.extract_facts.get_llm_provider") as mock_llm:
        mock_llm.return_value.complete_structured.return_value = FactList(
            facts=[Fact(statement="Revenue up 20%", confidence=0.9, source_url="url")]
        )
        result = await extract_facts(state)
    assert len(result["facts"]) == 1
    assert result["facts"][0]["statement"] == "Revenue up 20%"
```

## Testing PydanticAI Agents

### Mock Model Responses with `TestModel`

`TestModel` returns deterministic output — no LLM API calls.

```python
from pydantic_ai.models.test import TestModel

def test_fact_extraction_with_test_model():
    test_model = TestModel(
        custom_output=FactExtractionOutput(
            facts=["Revenue grew 20%"],
            entities=["Company X"],
            sentiment="positive",
            confidence=0.9,
        )
    )

    agent = Agent(
        test_model,
        output_type=FactExtractionOutput,
    )

    result = agent.run_sync("Revenue grew 20% YoY.")
    assert result.output.facts == ["Revenue grew 20%"]
    assert result.output.confidence == 0.9
```

### Test `output_type` Validation

Verify that the output model enforces constraints (ranges, required fields).

```python
def test_confidence_range_validation():
    """output_type with Field(ge=0.0, le=1.0) rejects out-of-range values."""
    with pytest.raises(ValidationError):
        SentimentOutput(sentiment="positive", confidence=1.5, reasoning="too high")

def test_output_type_required_fields():
    """All fields without defaults are required."""
    with pytest.raises(ValidationError):
        FactExtractionOutput(facts=[], entities=[])  # missing sentiment, confidence
```

### Test Dependency Injection with Test Deps

Inject mock dependencies — no real database or API calls.

```python
from unittest.mock import MagicMock

def test_agent_with_mock_deps():
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    deps = ExtractionDeps(db_session=mock_db, signal_id="test-123")

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

    result = agent.run_sync("Test input", deps=deps)
    assert result.output.facts == ["Test fact"]
    mock_db.query.assert_called()
```

### Test Tool Functions Independently

Tools are plain functions — test them without invoking the agent.

```python
def test_check_duplicate_facts_no_duplicate():
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    ctx = RunContext(deps=ExtractionDeps(db_session=mock_db, signal_id="s1"))
    assert check_duplicate_facts(ctx, "New fact") is False

def test_check_duplicate_facts_existing():
    mock_db = MagicMock()
    mock_fact = MagicMock()  # Simulates existing fact
    mock_db.query.return_value.filter.return_value.first.return_value = mock_fact

    ctx = RunContext(deps=ExtractionDeps(db_session=mock_db, signal_id="s1"))
    assert check_duplicate_facts(ctx, "Existing fact") is True
```

## Testing the Hybrid (LangGraph + PydanticAI)

Integration test pattern: LangGraph graph where nodes use PydanticAI agents internally, with all LLM calls mocked via `TestModel`.

```python
@pytest.fixture
def hybrid_graph():
    """Signal analysis graph where nodes use PydanticAI agents."""
    graph = StateGraph(SignalAnalysisState)
    graph.add_node("extract_facts", extract_facts_with_agent)
    graph.add_node("classify_sentiment", classify_with_agent)
    graph.add_node("score_confidence", score_with_agent)
    graph.add_edge(START, "extract_facts")
    graph.add_edge("extract_facts", "classify_sentiment")
    graph.add_edge("classify_sentiment", "score_confidence")
    graph.add_edge("score_confidence", END)
    return graph.compile(checkpointer=MemorySaver())

@pytest.mark.asyncio
async def test_hybrid_graph_with_test_models(hybrid_graph):
    """Each node's PydanticAI agent uses TestModel — fully deterministic."""
    config = {"configurable": {"thread_id": "hybrid-test-1"}}

    with patch("app.nodes.get_fact_agent") as mock_fact, \
         patch("app.nodes.get_sentiment_agent") as mock_sent, \
         patch("app.nodes.get_confidence_agent") as mock_conf:

        # Wire up TestModels for each agent
        mock_fact.return_value.run = AsyncMock(return_value=AgentRunResult(
            output=FactExtractionOutput(
                facts=["Revenue up 20%"], entities=["Company X"],
                sentiment="positive", confidence=0.9,
            )
        ))
        mock_sent.return_value.run = AsyncMock(return_value=AgentRunResult(
            output=SentimentOutput(sentiment="positive", confidence=0.85, reasoning="Growth", key_phrases=["20%"])
        ))
        mock_conf.return_value.run = AsyncMock(return_value=AgentRunResult(
            output=ConfidenceOutput(confidence_score=0.88, factors=["Strong evidence"], risks=[])
        ))

        result = await hybrid_graph.ainvoke(
            {"signal_id": "s1", "raw_text": "Revenue grew 20%.", "company_id": "c1"},
            config=config,
        )

    assert len(result["facts"]) == 1
    assert result["sentiment"] == "positive"
    assert result["confidence_score"] == 0.88
```

### Key Principles for Hybrid Tests

| Principle | Why |
|---|---|
| Mock at the agent boundary, not the LLM boundary | PydanticAI agents handle validation retries — mock the whole agent |
| Use `MemorySaver` for checkpointer | No PostgreSQL dependency in unit tests |
| Test router functions as pure functions | They're just `state -> str` — no need for graph invocation |
| Test node functions independently | Faster than full graph invocation for unit tests |
| Reserve full graph tests for integration | Verify state flow across nodes, not individual node logic |

## Integration Tests

Test pipeline end-to-end with mocked external calls.

```python
@pytest.mark.asyncio
async def test_full_pipeline_integration():
    # Mock all external dependencies
    with patch("scraper.fetch_url") as mock_fetch, \
         patch("llm.complete") as mock_llm:

        # Setup mocks
        mock_fetch.return_value = "<html>Article content</html>"
        mock_llm.side_effect = [
            '{"facts": [...]}',  # extract_facts response
            '{"implications": [...]}'  # infer_implications response
        ]

        # Run pipeline
        result = await process_signal("https://example.com/article")

        # Verify pipeline stages
        assert result.raw_data is not None
        assert len(result.analysis.facts) > 0
        assert result.analysis.signal_type is not None
        assert result.article is not None
```

## Quick Reference

### Test Types

| Type | What to Test | Mocking | Speed | Cost |
|------|--------------|---------|-------|------|
| Unit | Pure functions (parsing, classification, routing) | None | Fast | Free |
| Agent unit | PydanticAI agent with `TestModel` | Model only | Fast | Free |
| Graph unit | LangGraph node functions with mock state | Node internals | Fast | Free |
| Integration | Pipeline stages or graph end-to-end | External calls | Medium | Low |
| Hybrid | LangGraph graph with PydanticAI agents | Agent boundaries | Medium | Low |
| Snapshot | LLM output format | LLM responses | Fast | Free |

### What to Mock

- **HTTP requests**: Use `httpx.Response` fixtures or `respx` library
- **LLM calls**: Mock `llm.complete()` with predefined responses
- **PydanticAI agents**: Use `TestModel(custom_output=...)` for deterministic output
- **LangGraph checkpointer**: Use `MemorySaver()` instead of `AsyncPostgresSaver`
- **Database**: Use test database or mock repository layer
- **File system**: Use `tmp_path` fixture for temporary files
- **Time**: Use `freezegun` for deterministic timestamps

### Testing Checklist

- [ ] Pure functions have unit tests (parsing, classification, scoring)
- [ ] Prompt construction is tested (correct format, includes all data)
- [ ] Response parsing is tested (handles valid and invalid JSON)
- [ ] Error handling is tested (network failures, malformed data)
- [ ] Edge cases are tested (empty input, very long input, special characters)
- [ ] Integration tests verify pipeline flow (scrape → analyze → generate)
- [ ] LangGraph router functions tested as pure functions
- [ ] LangGraph node functions tested with mock state dicts
- [ ] PydanticAI agents tested with `TestModel`
- [ ] PydanticAI `output_type` validation constraints tested
- [ ] PydanticAI tool functions tested independently
- [ ] Hybrid graph tested with mocked agent boundaries

### Snapshot Testing

```python
# Test LLM output format (catch regressions)
def test_extract_facts_format(snapshot):
    prompt = build_extract_prompt("Sample text")
    # Use snapshot to verify format hasn't changed
    snapshot.assert_match(prompt)
```

## Common Mistakes

### Mistake 1: Testing LLM Output Content

**Bad:**
```python
def test_extract_facts():
    result = await extract_facts("Apple announced iPhone")
    assert result.facts[0].who == "Apple"  # LLM might say "Apple Inc."
```

**Good:**
```python
def test_extract_facts_structure():
    mock_response = '{"facts": [{"who": "Apple", ...}]}'
    result = parse_extract_response(mock_response)
    assert len(result.facts) > 0
    assert hasattr(result.facts[0], "who")
```

**Why:** LLM outputs vary; test structure and parsing, not exact content.

### Mistake 2: No Mocking

**Bad:**
```python
def test_scrape():
    result = scrape("https://real-site.com")  # Live HTTP call
    assert result.title is not None
```

**Good:**
```python
def test_scrape(mock_http):
    mock_http.get("https://real-site.com", text="<html>...</html>")
    result = scrape("https://real-site.com")
    assert result.title is not None
```

**Why:** Live calls are slow, expensive, flaky, and can fail for reasons unrelated to your code.

### Mistake 3: Testing LangGraph Graph Without Mocking Nodes

**Bad:**
```python
async def test_graph():
    result = await app.ainvoke({"signal_id": "s1", "raw_text": "...", "company_id": "c1"})
    # Makes real LLM calls — slow, expensive, non-deterministic
```

**Good:**
```python
async def test_graph():
    with patch("app.nodes.extract_facts.get_llm_provider") as mock:
        mock.return_value.complete_structured.return_value = expected_facts
        result = await app.ainvoke({"signal_id": "s1", ...})
    assert result["facts"] == expected_facts.facts
```

**Why:** Graph tests should verify state flow, not LLM behavior. Mock at node boundaries.

### Mistake 4: Testing PydanticAI Agent Without `TestModel`

**Bad:**
```python
def test_agent():
    agent = Agent("openai:gpt-4o", output_type=MyOutput)
    result = agent.run_sync("input")  # Real API call
```

**Good:**
```python
def test_agent():
    test_model = TestModel(custom_output=MyOutput(...))
    agent = Agent(test_model, output_type=MyOutput)
    result = agent.run_sync("input")  # Deterministic
```

**Why:** `TestModel` eliminates API costs, latency, and non-determinism.

### Mistake 5: Testing Implementation, Not Behavior

**Bad:**
```python
def test_extract_facts_calls_llm():
    with patch("llm.complete") as mock_llm:
        extract_facts("text")
        assert mock_llm.called  # Tests implementation detail
```

**Good:**
```python
def test_extract_facts_returns_facts():
    with patch("llm.complete", return_value='{"facts": [...]}'):
        result = extract_facts("text")
        assert len(result.facts) > 0  # Tests behavior
```

**Why:** Implementation changes shouldn't break tests; test what the function does, not how it does it.
