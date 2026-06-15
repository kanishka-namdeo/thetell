"""Pydantic models for domain entities and API request/response schemas."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SourceType(str, Enum):
    """Type of signal source."""

    NEWS = "NEWS"
    FILING = "FILING"
    TRANSCRIPT = "TRANSCRIPT"
    SOCIAL = "SOCIAL"
    BLOG = "BLOG"
    JOB_POSTING = "JOB_POSTING"


class SignalStatus(str, Enum):
    """Processing status of a signal."""

    PENDING = "PENDING"
    ANALYZING = "ANALYZING"
    ANALYZED = "ANALYZED"
    FAILED = "FAILED"


class Sentiment(str, Enum):
    """Sentiment classification."""

    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    NEUTRAL = "NEUTRAL"


class ArticleStatus(str, Enum):
    """Publication status of an article."""

    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class FactCategory(str, Enum):
    """Category of an extracted fact."""

    FINANCIAL = "financial"
    STRATEGIC = "strategic"
    OPERATIONAL = "operational"
    PERSONNEL = "personnel"
    MARKET = "market"


# --- Domain Models ---


class Fact(BaseModel):
    """A single extracted fact from a signal."""

    text: str = Field(..., description="The fact statement")
    category: FactCategory = Field(..., description="Category of fact")
    source_sentence: str = Field(..., description="Original sentence from the signal")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in this fact")


class StrategicTheme(BaseModel):
    """A strategic theme identified from a signal."""

    label: str = Field(..., description="Theme label, e.g., 'expansion', 'M&A'")
    evidence: list[str] = Field(default_factory=list, description="Supporting evidence snippets")
    correlation_hints: list[str] = Field(
        default_factory=list, description="Hints for cross-signal correlation"
    )


# --- Response Schemas (ORM-compatible) ---


class CompanyResponse(BaseModel):
    """Company response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    ticker: str | None = None
    description: str | None = None
    websiteUrl: str | None = None
    createdAt: datetime
    updatedAt: datetime


class AnalysisResponse(BaseModel):
    """Analysis response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    signalId: str
    summary: str
    keyFacts: Any
    sentiment: Sentiment
    strategicThemes: Any
    confidence: float
    modelUsed: str
    analyzedAt: datetime


class SignalResponse(BaseModel):
    """Signal response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sourceUrl: str
    sourceType: SourceType
    title: str
    rawContent: str
    publishedAt: datetime | None = None
    scrapedAt: datetime
    companyId: str
    status: SignalStatus
    createdAt: datetime
    updatedAt: datetime


class SignalDetailResponse(SignalResponse):
    """Signal response with nested analysis and company."""

    analysis: AnalysisResponse | None = None
    company: CompanyResponse | None = None


class ArticleResponse(BaseModel):
    """Article response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    slug: str
    summary: str
    body: str
    companyId: str
    analysisIds: Any = None
    publishedAt: datetime | None = None
    status: ArticleStatus
    authorId: str | None = None
    createdAt: datetime
    updatedAt: datetime


class ArticleDetailResponse(ArticleResponse):
    """Article response with nested company and author."""

    company: CompanyResponse | None = None


class CompanyDetailResponse(CompanyResponse):
    """Company response with recent signals and articles."""

    signals: list[SignalResponse] = []
    articles: list[ArticleResponse] = []


# --- Request Schemas ---


class CompanyCreate(BaseModel):
    """Schema for creating a company."""

    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    ticker: str | None = None
    description: str = ""
    website_url: str | None = None


class CompanyUpdate(BaseModel):
    """Schema for updating a company."""

    name: str | None = None
    ticker: str | None = None
    description: str | None = None
    website_url: str | None = None


class SignalCreate(BaseModel):
    """Schema for creating a signal."""

    source_url: str = Field(..., description="URL where signal was found")
    source_type: SourceType
    title: str
    raw_content: str
    published_at: datetime | None = None
    company_id: str


class ArticleGenerateRequest(BaseModel):
    """Schema for requesting article generation."""

    company_id: str
    analysis_ids: list[str]


# --- Generic Response Schemas ---


class PaginatedResponse(BaseModel):
    """Generic paginated response."""

    items: list[Any]
    next_cursor: str | None = None
    has_more: bool = False


class ErrorResponse(BaseModel):
    """Standard error response format."""

    error: str
    message: str
    details: dict[str, Any] | None = None
