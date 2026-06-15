"""End-to-end signal analysis pipeline."""

from __future__ import annotations

from uuid import UUID, uuid4
from datetime import datetime

import structlog

from app.analysis.confidence import calculate_confidence
from app.analysis.fact_extraction import extract_facts
from app.analysis.sentiment import classify_sentiment
from app.analysis.themes import identify_themes
from app.llm.models import LLMRequest
from app.llm.prompts import build_summary_prompt
from app.llm.provider import get_provider
from app.db.models import Analysis, Signal

logger = structlog.get_logger()


async def analyze_signal(
    signal: Signal,
    provider_name: str = "openai",
    model: str | None = None,
) -> Analysis:
    """Analyze a signal end-to-end.

    Steps:
    1. Extract key facts
    2. Classify sentiment
    3. Identify strategic themes
    4. Generate summary
    5. Calculate composite confidence
    6. Return AnalysisResult
    """
    logger.info(
        "Starting signal analysis",
        signal_id=signal.id,
        source_type=signal.source_type,
        content_length=len(signal.raw_content),
    )

    # Run analysis tasks (could be parallelized with asyncio.gather)
    facts_result = await extract_facts(signal.raw_content, provider_name, model)
    sentiment_result = await classify_sentiment(signal.raw_content, provider_name, model)
    themes_result = await identify_themes(signal.raw_content, provider_name, model)

    # Generate summary
    provider = get_provider(provider_name)
    summary_messages = build_summary_prompt(signal.raw_content, signal.title)
    summary_request = LLMRequest(messages=summary_messages, model=model, temperature=0.5)
    summary_response = await provider.complete(summary_request)
    summary = summary_response.content

    # Calculate composite confidence
    confidence = calculate_confidence(
        source_type=signal.source_type,
        content_length=len(signal.raw_content),
        facts=facts_result.facts,
        themes=themes_result.themes,
        llm_confidence=sentiment_result.confidence,
    )

    analysis = Analysis(
        id=str(uuid4()),
        signalId=signal.id,
        summary=summary,
        keyFacts=[f.model_dump() for f in facts_result.facts],
        sentiment=sentiment_result.sentiment.value,
        strategicThemes=[t.model_dump() for t in themes_result.themes],
        confidence=confidence,
        modelUsed=provider_name,
        analyzedAt=datetime.utcnow(),
    )

    logger.info(
        "Completed signal analysis",
        signal_id=signal.id,
        analysis_id=analysis.id,
        confidence=round(confidence, 3),
        sentiment=sentiment_result.sentiment,
        facts_count=len(facts_result.facts),
        themes_count=len(themes_result.themes),
    )

    return analysis
