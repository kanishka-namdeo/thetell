"""Composite confidence scoring for analysis results."""

from __future__ import annotations

from app.models.schemas import Fact, SourceType, StrategicTheme


def calculate_confidence(
    source_type: SourceType,
    content_length: int,
    facts: list[Fact],
    themes: list[StrategicTheme],
    llm_confidence: float = 0.8,
) -> float:
    """Calculate composite confidence score for an analysis.

    Factors:
    - Source reliability (0.0-1.0 weight)
    - Content quality (length, specificity)
    - Fact confidence (average of fact confidences)
    - Theme evidence strength
    - LLM self-reported confidence

    Returns a score between 0.0 and 1.0.
    """
    # Source reliability weights
    source_weights = {
        SourceType.FILING: 0.95,
        SourceType.TRANSCRIPT: 0.90,
        SourceType.NEWS: 0.80,
        SourceType.BLOG: 0.65,
        SourceType.SOCIAL: 0.50,
        SourceType.JOB_POSTING: 0.70,
    }
    source_score = source_weights.get(source_type, 0.70)

    # Content quality score (based on length)
    # Optimal range: 500-5000 characters
    if content_length < 100:
        content_score = 0.3
    elif content_length < 500:
        content_score = 0.6
    elif content_length <= 5000:
        content_score = 0.9
    else:
        content_score = 0.85  # Very long content, slightly lower

    # Fact confidence score
    if facts:
        avg_fact_confidence = sum(f.confidence for f in facts) / len(facts)
        fact_score = avg_fact_confidence
    else:
        fact_score = 0.5  # No facts extracted, moderate confidence

    # Theme evidence score
    if themes:
        total_evidence = sum(len(t.evidence) for t in themes)
        if total_evidence == 0:
            theme_score = 0.4
        elif total_evidence < len(themes) * 2:
            theme_score = 0.7
        else:
            theme_score = 0.9
    else:
        theme_score = 0.5  # No themes identified

    # Weighted composite score
    weights = {
        "source": 0.25,
        "content": 0.15,
        "facts": 0.30,
        "themes": 0.15,
        "llm": 0.15,
    }

    composite = (
        source_score * weights["source"]
        + content_score * weights["content"]
        + fact_score * weights["facts"]
        + theme_score * weights["themes"]
        + llm_confidence * weights["llm"]
    )

    # Clamp to [0.0, 1.0]
    return max(0.0, min(1.0, composite))
