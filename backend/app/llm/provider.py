"""LLM provider abstraction with OpenAI and Anthropic implementations."""

from __future__ import annotations

import json
from typing import Any, Protocol, TypeVar

import anthropic
import openai
import structlog

from app.config import settings
from app.llm.models import (
    LLMMessage,
    LLMRequest,
    LLMResponse,
    MessageRole,
    TokenUsage,
)

logger = structlog.get_logger()

T = TypeVar("T")


class LLMProvider(Protocol):
    """Protocol for LLM providers."""

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Generate a completion from messages."""
        ...

    async def complete_structured(
        self, request: LLMRequest, response_model: type[T]
    ) -> T:
        """Generate a structured completion parsed into a Pydantic model."""
        ...


class OpenAIProvider:
    """OpenAI LLM provider."""

    def __init__(self, api_key: str | None = None) -> None:
        self._client = openai.AsyncOpenAI(api_key=api_key or settings.openai_api_key)

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Generate a completion using OpenAI."""
        model = request.model or "gpt-4o"
        messages = [{"role": m.role.value, "content": m.content} for m in request.messages]

        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        choice = response.choices[0]
        usage = response.usage

        return LLMResponse(
            content=choice.message.content or "",
            model=response.model,
            usage=TokenUsage(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                total_tokens=usage.total_tokens if usage else 0,
            ),
            finish_reason=choice.finish_reason or "",
        )

    async def complete_structured(
        self, request: LLMRequest, response_model: type[T]
    ) -> T:
        """Generate a structured completion using OpenAI's JSON mode."""
        model = request.model or "gpt-4o"
        messages = [{"role": m.role.value, "content": m.content} for m in request.messages]

        # Add instruction to output JSON
        messages.append(
            {
                "role": "system",
                "content": "Respond with valid JSON only, no additional text.",
            }
        )

        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)
        return response_model(**parsed)


class AnthropicProvider:
    """Anthropic LLM provider."""

    def __init__(self, api_key: str | None = None) -> None:
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key or settings.anthropic_api_key
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Generate a completion using Anthropic."""
        model = request.model or "claude-3-5-sonnet-20241022"

        # Separate system message from conversation messages
        system_msg = ""
        messages = []
        for m in request.messages:
            if m.role == MessageRole.SYSTEM:
                system_msg += m.content + "\n"
            else:
                messages.append({"role": m.role.value, "content": m.content})

        response = await self._client.messages.create(
            model=model,
            max_tokens=request.max_tokens,
            system=system_msg.strip() if system_msg else "",
            messages=messages,
        )

        # Extract text from response
        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        return LLMResponse(
            content=content,
            model=response.model,
            usage=TokenUsage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            ),
            finish_reason=response.stop_reason or "",
        )

    async def complete_structured(
        self, request: LLMRequest, response_model: type[T]
    ) -> T:
        """Generate a structured completion using Anthropic."""
        model = request.model or "claude-3-5-sonnet-20241022"

        # Add instruction to output JSON
        messages = list(request.messages)
        messages.append(
            LLMMessage(
                role=MessageRole.USER,
                content="Respond with valid JSON only, no additional text.",
            )
        )

        # Separate system message
        system_msg = ""
        conv_messages = []
        for m in messages:
            if m.role == MessageRole.SYSTEM:
                system_msg += m.content + "\n"
            else:
                conv_messages.append({"role": m.role.value, "content": m.content})

        response = await self._client.messages.create(
            model=model,
            max_tokens=request.max_tokens,
            system=system_msg.strip() if system_msg else "",
            messages=conv_messages,
        )

        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        # Parse JSON from response
        parsed = json.loads(content)
        return response_model(**parsed)


def get_provider(name: str = "openai") -> LLMProvider:
    """Get an LLM provider by name."""
    providers = {
        "openai": OpenAIProvider,
        "anthropic": AnthropicProvider,
    }

    if name not in providers:
        raise ValueError(f"Unknown provider: {name}. Available: {list(providers.keys())}")

    return providers[name]()
