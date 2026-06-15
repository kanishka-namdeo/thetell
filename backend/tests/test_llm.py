"""Tests for the LLM module."""

from __future__ import annotations

import pytest

from app.llm.models import LLMMessage, LLMRequest, MessageRole


def test_llm_message_creation():
    """Test LLM message creation."""
    msg = LLMMessage(role=MessageRole.USER, content="Hello")
    assert msg.role == MessageRole.USER
    assert msg.content == "Hello"


def test_llm_request_creation():
    """Test LLM request creation with defaults."""
    messages = [LLMMessage(role=MessageRole.USER, content="Test")]
    request = LLMRequest(messages=messages)
    assert len(request.messages) == 1
    assert request.temperature == 0.7
    assert request.max_tokens == 4096


def test_llm_request_custom_params():
    """Test LLM request with custom parameters."""
    messages = [LLMMessage(role=MessageRole.USER, content="Test")]
    request = LLMRequest(
        messages=messages,
        model="gpt-4",
        temperature=0.5,
        max_tokens=1000,
    )
    assert request.model == "gpt-4"
    assert request.temperature == 0.5
    assert request.max_tokens == 1000
