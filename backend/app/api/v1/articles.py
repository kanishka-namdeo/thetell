"""API v1 router for articles."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.db.models import Article, Company, Analysis
from app.models.schemas import (
    ArticleResponse,
    ArticleDetailResponse,
    ArticleGenerateRequest,
    PaginatedResponse,
)
from app.articles.generator import generate_article as generate_article_from_analyses

router = APIRouter()


@router.get("/articles", response_model=PaginatedResponse)
async def list_articles(
    company_id: str | None = None,
    status_filter: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> PaginatedResponse:
    """List articles with filters and cursor pagination."""
    query = select(Article).options(selectinload(Article.company))

    conditions = []
    if company_id:
        conditions.append(Article.companyId == company_id)
    if status_filter:
        conditions.append(Article.status == status_filter)

    if conditions:
        query = query.where(and_(*conditions))

    if cursor:
        query = query.where(Article.id < cursor)

    query = query.order_by(Article.id.desc()).limit(limit + 1)

    result = await db.execute(query)
    articles = result.scalars().all()

    has_more = len(articles) > limit
    if has_more:
        articles = articles[:limit]

    next_cursor = articles[-1].id if has_more else None

    return PaginatedResponse(
        items=[ArticleDetailResponse.model_validate(a) for a in articles],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/articles/{article_id}", response_model=ArticleDetailResponse)
async def get_article(
    article_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> ArticleDetailResponse:
    """Get a single article by ID with company."""
    query = (
        select(Article)
        .options(
            selectinload(Article.company),
        )
        .where(Article.id == article_id)
    )

    result = await db.execute(query)
    article = result.scalar_one_or_none()

    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Article {article_id} not found"},
        )

    return ArticleDetailResponse.model_validate(article)


@router.post("/articles/generate", response_model=ArticleResponse, status_code=status.HTTP_201_CREATED)
async def generate_article_endpoint(
    request: ArticleGenerateRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> ArticleResponse:
    """Generate an article from analysis IDs."""
    company = await db.get(Company, request.company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Company {request.company_id} not found"},
        )

    if not request.analysis_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "bad_request", "message": "At least one analysis ID is required"},
        )

    query = select(Analysis).where(Analysis.id.in_(request.analysis_ids))
    result = await db.execute(query)
    analyses = result.scalars().all()

    if len(analyses) != len(request.analysis_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "One or more analyses not found"},
        )

    try:
        article_data = await generate_article_from_analyses(
            company=company,
            analyses=analyses,
            provider_name="openai",
        )

        article = Article(
            id=str(article_data.id),
            title=article_data.title,
            slug=article_data.slug,
            summary=article_data.summary,
            body=article_data.body,
            companyId=request.company_id,
            analysisIds=[str(aid) for aid in article_data.analysis_ids],
            publishedAt=article_data.published_at,
            status="DRAFT",
        )

        db.add(article)
        await db.flush()
        await db.refresh(article)

        return ArticleResponse.model_validate(article)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "generation_failed", "message": str(e)},
        )
