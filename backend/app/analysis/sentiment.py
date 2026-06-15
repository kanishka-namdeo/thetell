"""Sentiment classification for signals."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.llm.models import LLMRequest
from app.llm.prompts import build_sentiment_prompt
from app.models.schemas import Sentiment


class SentimentResult(BaseModel):
    """Result of sentiment analysis."""

    sentiment: Sentiment = Sentiment.NEUTRAL
    confidence: float = Field(..., ge=0.0, le=1.0)
    key_phrases: list[str] = Field(default_factory=list)


async def classify_sentiment(
    text: str, provider_name: str = "openai", model: str | None = None
) -> SentimentResult:
    """Classify the sentiment of signal text."""
    from app.llm.provider import get_provider

    provider = get_provider(provider_name)
    messages = build_sentiment_prompt(text)

    request = LLMRequest(messages=messages, model=model, temperature=0.3)
    result = await provider.complete_structured(request, SentimentResult)

    return result
