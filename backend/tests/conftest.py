"""Shared pytest fixtures."""

from __future__ import annotations

import pytest


@pytest.fixture
def sample_signal_text():
    """Sample signal text for testing."""
    return """
    Apple Inc. reported strong Q4 2024 results today, with revenue reaching $94.9 billion,
    up 6% year-over-year. CEO Tim Cook highlighted the company's expansion into AI services,
    stating "We're investing heavily in generative AI capabilities across our product lineup."
    The company also announced plans to open a new data center in Arizona, creating 500 jobs.
    However, iPhone sales in China declined 3% due to increased competition from local manufacturers.
    """


@pytest.fixture
def sample_company():
    """Sample company data for testing."""
    return {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "Apple Inc.",
        "ticker": "AAPL",
        "description": "Technology company focused on consumer electronics",
    }
