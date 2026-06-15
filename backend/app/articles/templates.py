"""Article structure templates and formatting."""

from __future__ import annotations


def format_article_markdown(
    headline: str,
    summary: str,
    body: str,
    company_name: str,
    citations: list[dict[str, str]] | None = None,
) -> str:
    """Format a complete article in markdown."""
    parts = [
        f"# {headline}",
        "",
        f"**{company_name}**",
        "",
        f"*{summary}*",
        "",
        "---",
        "",
        body,
    ]

    if citations:
        parts.append("")
        parts.append("---")
        parts.append("")
        parts.append("## Sources")
        parts.append("")
        for i, citation in enumerate(citations, 1):
            title = citation.get("title", "Untitled")
            url = citation.get("url", "")
            confidence = citation.get("confidence", "")
            if url:
                parts.append(f"{i}. [{title}]({url})")
            else:
                parts.append(f"{i}. {title}")
            if confidence:
                parts.append(f"   Confidence: {confidence}")

    return "\n".join(parts)


def generate_slug(title: str) -> str:
    """Generate a URL-friendly slug from a title."""
    import re

    slug = title.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug.strip("-")
