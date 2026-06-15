"""Tests for the article generation module."""

from __future__ import annotations

import pytest

from app.articles.templates import format_article_markdown, generate_slug


def test_generate_slug():
    """Test slug generation from title."""
    slug = generate_slug("Apple Reports Strong Q4 Results")
    assert slug == "apple-reports-strong-q4-results"


def test_generate_slug_special_chars():
    """Test slug generation with special characters."""
    slug = generate_slug("Company's Growth: 20% Increase!")
    assert slug == "companys-growth-20-increase"


def test_format_article_markdown_basic():
    """Test basic article formatting."""
    markdown = format_article_markdown(
        headline="Test Headline",
        summary="Test summary",
        body="Test body content",
        company_name="Test Company",
    )
    assert "# Test Headline" in markdown
    assert "**Test Company**" in markdown
    assert "Test summary" in markdown
    assert "Test body content" in markdown


def test_format_article_markdown_with_citations():
    """Test article formatting with citations."""
    citations = [
        {"title": "Source 1", "url": "https://example.com/1", "confidence": "0.85"},
        {"title": "Source 2", "url": "https://example.com/2", "confidence": "0.90"},
    ]
    markdown = format_article_markdown(
        headline="Test Headline",
        summary="Test summary",
        body="Test body",
        company_name="Test Company",
        citations=citations,
    )
    assert "## Sources" in markdown
    assert "[Source 1](https://example.com/1)" in markdown
    assert "[Source 2](https://example.com/2)" in markdown
    assert "Confidence: 0.85" in markdown
