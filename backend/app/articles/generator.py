"""Article generation from analysis results."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import structlog

from app.articles.templates import format_article_markdown, generate_slug
from app.llm.models import LLMRequest
from app.llm.prompts import (
    build_article_body_prompt,
    build_article_headline_prompt,
    build_article_summary_prompt,
)
from app.llm.provider import get_provider
from app.db.models import Analysis, Article, Company

logger = structlog.get_logger()


async def generate_article(
    company: Company,
    analyses: list[Analysis],
    provider_name: str = "openai",
    model: str | None = None,
) -> Article:
    """Generate a news-style article from multiple signal analyses.

    Steps:
    1. Aggregate analyses for the company
    2. Generate headline (LLM)
    3. Generate executive summary (LLM)
    4. Generate article body with sections (LLM)
    5. Include source citations with confidence indicators
    6. Return Article with markdown body
    """
    logger.info(
        "Starting article generation",
        company_id=company.id,
        company_name=company.name,
        analyses_count=len(analyses),
    )

    if not analyses:
        raise ValueError("Cannot generate article with no analyses")

    provider = get_provider(provider_name)

    # Prepare data for article generation
    summaries = [a.summary for a in analyses]
    all_themes = []
    for analysis in analyses:
        all_themes.extend([t['label'] for t in analysis.strategicThemes])
    unique_themes = list(set(all_themes))

    # Generate headline
    headline_messages = build_article_headline_prompt(
        company.name, summaries, unique_themes
    )
    headline_request = LLMRequest(messages=headline_messages, model=model, temperature=0.6)
    headline_response = await provider.complete(headline_request)
    headline = headline_response.content.strip()

    # Generate executive summary
    summary_messages = build_article_summary_prompt(
        company.name, headline, summaries, unique_themes
    )
    summary_request = LLMRequest(messages=summary_messages, model=model, temperature=0.5)
    summary_response = await provider.complete(summary_request)
    executive_summary = summary_response.content.strip()

    # Prepare analyses data for body generation
    analyses_data = []
    for analysis in analyses:
        facts_text = [f['text'] for f in analysis.keyFacts]
        analyses_data.append(
            {
                "summary": analysis.summary,
                "facts": facts_text,
                "sentiment": analysis.sentiment,
            }
        )

    # Generate article body
    body_messages = build_article_body_prompt(
        company.name, headline, executive_summary, analyses_data
    )
    body_request = LLMRequest(messages=body_messages, model=model, temperature=0.6)
    body_response = await provider.complete(body_request)
    body = body_response.content.strip()

    # Prepare citations
    citations = []
    for analysis in analyses:
        citations.append(
            {
                "title": f"Analysis {analysis.id}",
                "url": "",  # Would be populated from signal.source_url if available
                "confidence": f"{analysis.confidence:.2f}",
            }
        )

    # Format complete article
    formatted_body = format_article_markdown(
        headline=headline,
        summary=executive_summary,
        body=body,
        company_name=company.name,
        citations=citations,
    )

    article = Article(
        id=str(uuid4()),
        title=headline,
        slug=generate_slug(headline),
        summary=executive_summary,
        body=formatted_body,
        companyId=company.id,
        analysisIds=[a.id for a in analyses],
        publishedAt=datetime.utcnow(),
        status="DRAFT",
    )

    logger.info(
        "Completed article generation",
        article_id=article.id,
        headline=headline[:60],
        body_length=len(formatted_body),
    )

    return article
