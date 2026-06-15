"""Tests for the analysis module."""

from __future__ import annotations

import pytest

from app.analysis.confidence import calculate_confidence
from app.models.schemas import Fact, FactCategory, SourceType, StrategicTheme


def test_confidence_calculation_basic():
    """Test basic confidence calculation."""
    confidence = calculate_confidence(
        source_type=SourceType.NEWS,
        content_length=1000,
        facts=[],
        themes=[],
        llm_confidence=0.8,
    )
    assert 0.0 <= confidence <= 1.0


def test_confidence_with_facts():
    """Test confidence with facts."""
    facts = [
        Fact(
            text="Revenue increased",
            category=FactCategory.FINANCIAL,
            source_sentence="Revenue increased by 20%",
            confidence=0.9,
        ),
        Fact(
            text="New product launch",
            category=FactCategory.STRATEGIC,
            source_sentence="Launching new product",
            confidence=0.85,
        ),
    ]
    confidence = calculate_confidence(
        source_type=SourceType.NEWS,
        content_length=1500,
        facts=facts,
        themes=[],
        llm_confidence=0.8,
    )
    assert confidence > 0.5


def test_confidence_with_themes():
    """Test confidence with themes."""
    themes = [
        StrategicTheme(
            label="expansion",
            evidence=["Opening new offices", "Hiring in new markets"],
        ),
    ]
    confidence = calculate_confidence(
        source_type=SourceType.NEWS,
        content_length=1000,
        facts=[],
        themes=themes,
        llm_confidence=0.8,
    )
    assert 0.0 <= confidence <= 1.0


def test_confidence_source_weights():
    """Test that different source types have different weights."""
    filing_confidence = calculate_confidence(
        source_type=SourceType.FILING,
        content_length=1000,
        facts=[],
        themes=[],
        llm_confidence=0.8,
    )
    social_confidence = calculate_confidence(
        source_type=SourceType.SOCIAL,
        content_length=1000,
        facts=[],
        themes=[],
        llm_confidence=0.8,
    )
    # Filing should have higher confidence than social
    assert filing_confidence > social_confidence


def test_confidence_content_length():
    """Test that content length affects confidence."""
    short_confidence = calculate_confidence(
        source_type=SourceType.NEWS,
        content_length=50,
        facts=[],
        themes=[],
        llm_confidence=0.8,
    )
    long_confidence = calculate_confidence(
        source_type=SourceType.NEWS,
        content_length=2000,
        facts=[],
        themes=[],
        llm_confidence=0.8,
    )
    # Longer content should have higher confidence
    assert long_confidence > short_confidence
