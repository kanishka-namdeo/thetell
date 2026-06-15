"""API v1 router for analyses."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.db.models import Analysis, Signal
from app.models.schemas import AnalysisResponse, PaginatedResponse

router = APIRouter()


@router.get("/analyses", response_model=PaginatedResponse)
async def list_analyses(
    company_id: str | None = None,
    sentiment: str | None = None,
    min_confidence: float | None = None,
    max_confidence: float | None = None,
    limit: int = 20,
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> PaginatedResponse:
    """List analyses with filters and cursor pagination."""
    query = select(Analysis).options(selectinload(Analysis.signal))

    conditions = []
    if company_id:
        conditions.append(Signal.companyId == company_id)
        query = query.join(Signal)
    if sentiment:
        conditions.append(Analysis.sentiment == sentiment)
    if min_confidence is not None:
        conditions.append(Analysis.confidence >= min_confidence)
    if max_confidence is not None:
        conditions.append(Analysis.confidence <= max_confidence)

    if conditions:
        query = query.where(and_(*conditions))

    if cursor:
        query = query.where(Analysis.id < cursor)

    query = query.order_by(Analysis.id.desc()).limit(limit + 1)

    result = await db.execute(query)
    analyses = result.scalars().all()

    has_more = len(analyses) > limit
    if has_more:
        analyses = analyses[:limit]

    next_cursor = analyses[-1].id if has_more else None

    return PaginatedResponse(
        items=[AnalysisResponse.model_validate(a) for a in analyses],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> AnalysisResponse:
    """Get a single analysis by ID."""
    query = (
        select(Analysis)
        .options(selectinload(Analysis.signal))
        .where(Analysis.id == analysis_id)
    )

    result = await db.execute(query)
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Analysis {analysis_id} not found"},
        )

    return AnalysisResponse.model_validate(analysis)
