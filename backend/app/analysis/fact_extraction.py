"""Fact extraction from signal text."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.llm.models import LLMRequest
from app.llm.prompts import build_fact_extraction_prompt
from app.models.schemas import Fact, FactCategory


class FactExtractionResult(BaseModel):
    """Result of fact extraction."""

    facts: list[Fact] = Field(default_factory=list)


async def extract_facts(
    text: str, provider_name: str = "openai", model: str | None = None
) -> FactExtractionResult:
    """Extract structured facts from signal text."""
    from app.llm.provider import get_provider

    provider = get_provider(provider_name)
    messages = build_fact_extraction_prompt(text)

    request = LLMRequest(messages=messages, model=model, temperature=0.3)
    result = await provider.complete_structured(request, FactExtractionResult)

    return result
