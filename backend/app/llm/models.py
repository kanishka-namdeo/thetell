"""Pydantic models for LLM requests and responses."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    """LLM message roles."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class LLMMessage(BaseModel):
    """A single message in an LLM conversation."""

    role: MessageRole
    content: str


class TokenUsage(BaseModel):
    """Token usage statistics."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    """Response from an LLM provider."""

    content: str
    model: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    finish_reason: str = ""
    raw_response: dict[str, Any] = Field(default_factory=dict)


class LLMRequest(BaseModel):
    """Request to an LLM provider."""

    messages: list[LLMMessage]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 4096
    stop: list[str] | None = None
