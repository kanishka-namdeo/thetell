"""Prompt templates for LLM analysis tasks."""

from __future__ import annotations

from app.llm.models import LLMMessage, MessageRole


def build_fact_extraction_prompt(text: str) -> list[LLMMessage]:
    """Build prompt for extracting key facts from signal text."""
    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are an expert corporate intelligence analyst. Extract key facts from the provided text.

For each fact, provide:
- text: A clear statement of the fact
- category: One of: financial, strategic, operational, personnel, market
- source_sentence: The exact sentence from the text that supports this fact
- confidence: Your confidence in this fact (0.0 to 1.0)

Respond with a JSON object with a "facts" array containing these objects.""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"Extract key facts from this text:\n\n{text}",
        ),
    ]


def build_sentiment_prompt(text: str) -> list[LLMMessage]:
    """Build prompt for sentiment classification."""
    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are an expert at analyzing corporate sentiment. Classify the overall sentiment of the text.

Provide:
- sentiment: One of: POSITIVE, NEGATIVE, NEUTRAL
- confidence: Your confidence in this classification (0.0 to 1.0)
- key_phrases: List of phrases that drive the sentiment

Respond with a JSON object containing these fields.""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"Analyze the sentiment of this text:\n\n{text}",
        ),
    ]


def build_themes_prompt(text: str) -> list[LLMMessage]:
    """Build prompt for identifying strategic themes."""
    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are a corporate strategy analyst. Identify strategic themes in the text.

Common themes include: expansion, cost-cutting, M&A, leadership change, product launch, market entry, partnership, restructuring, innovation, competition.

For each theme, provide:
- label: The theme name
- evidence: List of text snippets supporting this theme
- correlation_hints: Suggestions for what other signals might correlate with this theme

Respond with a JSON object with a "themes" array.""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"Identify strategic themes in this text:\n\n{text}",
        ),
    ]


def build_summary_prompt(text: str, company_name: str) -> list[LLMMessage]:
    """Build prompt for generating a summary."""
    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are a corporate intelligence analyst. Generate a concise summary (2-3 sentences) of the key strategic implications of this text.

Focus on what this reveals about the company's strategy, plans, or market position. Be specific and actionable.""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"Summarize this text about {company_name}:\n\n{text}",
        ),
    ]


def build_article_headline_prompt(
    company_name: str, summaries: list[str], themes: list[str]
) -> list[LLMMessage]:
    """Build prompt for generating an article headline."""
    themes_str = ", ".join(themes) if themes else "none identified"
    summaries_text = "\n\n".join(f"- {s}" for s in summaries)

    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are a business journalist. Generate a compelling headline for a corporate intelligence article.

The headline should be:
- Specific and informative
- Under 80 characters
- Focused on strategic implications
- Written in active voice""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"""Company: {company_name}
Strategic themes: {themes_str}

Key findings:
{summaries_text}

Generate a headline for this article.""",
        ),
    ]


def build_article_summary_prompt(
    company_name: str, headline: str, summaries: list[str], themes: list[str]
) -> list[LLMMessage]:
    """Build prompt for generating an article executive summary."""
    themes_str = ", ".join(themes) if themes else "none identified"
    summaries_text = "\n\n".join(f"- {s}" for s in summaries)

    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are a business journalist. Write an executive summary (3-4 sentences) for a corporate intelligence article.

The summary should:
- Capture the key strategic insights
- Highlight the most significant findings
- Indicate potential implications
- Be written in a professional, analytical tone""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"""Headline: {headline}
Company: {company_name}
Strategic themes: {themes_str}

Key findings:
{summaries_text}

Write an executive summary.""",
        ),
    ]


def build_article_body_prompt(
    company_name: str,
    headline: str,
    summary: str,
    analyses: list[dict[str, str]],
) -> list[LLMMessage]:
    """Build prompt for generating the article body in markdown."""
    analyses_text = "\n\n".join(
        f"### Analysis {i+1}\n{a.get('summary', '')}\n\nKey facts:\n"
        + "\n".join(f"- {f}" for f in a.get("facts", []))
        + f"\n\nSentiment: {a.get('sentiment', 'NEUTRAL')}"
        for i, a in enumerate(analyses)
    )

    return [
        LLMMessage(
            role=MessageRole.SYSTEM,
            content="""You are a business journalist. Write the body of a corporate intelligence article in markdown format.

Structure the article with these sections:
## Key Findings
## Evidence & Analysis
## Strategic Implications
## Outlook

Use markdown formatting:
- Headers (##, ###)
- Bullet points
- Bold for emphasis
- Blockquotes for direct citations

Write in a professional, analytical tone. Include specific data points and cite sources.""",
        ),
        LLMMessage(
            role=MessageRole.USER,
            content=f"""Headline: {headline}
Executive Summary: {summary}
Company: {company_name}

Source analyses:
{analyses_text}

Write the article body in markdown.""",
        ),
    ]
