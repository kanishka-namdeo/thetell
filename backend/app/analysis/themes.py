"""Strategic theme identification."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.llm.models import LLMRequest
from app.llm.prompts import build_themes_prompt
from app.models.schemas import StrategicTheme


class ThemeExtractionResult(BaseModel):
    """Result of theme extraction."""

    themes: list[StrategicTheme] = Field(default_factory=list)


async def identify_themes(
    text: str, provider_name: str = "openai", model: str | None = None
) -> ThemeExtractionResult:
    """Identify strategic themes in signal text."""
    from app.llm.provider import get_provider

    provider = get_provider(provider_name)
    messages = build_themes_prompt(text)

    request = LLMRequest(messages=messages, model=model, temperature=0.4)
    result = await provider.complete_structured(request, ThemeExtractionResult)

    return result
