"""API v1 router for signals."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.db.models import Signal, Analysis, Company
from app.models.schemas import (
    SignalResponse,
    SignalDetailResponse,
    SignalCreate,
    PaginatedResponse,
)
from app.tasks.analysis import process_signal_analysis

router = APIRouter()


@router.get("/signals", response_model=PaginatedResponse)
async def list_signals(
    company_id: str | None = None,
    source_type: str | None = None,
    status_filter: str | None = None,
    sentiment: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> PaginatedResponse:
    """List signals with cursor pagination and filters."""
    query = select(Signal).options(
        selectinload(Signal.company),
        selectinload(Signal.analysis),
    )

    conditions = []
    if company_id:
        conditions.append(Signal.companyId == company_id)
    if source_type:
        conditions.append(Signal.sourceType == source_type)
    if status_filter:
        conditions.append(Signal.status == status_filter)
    if sentiment:
        conditions.append(Signal.analysis.has(Analysis.sentiment == sentiment))

    if conditions:
        query = query.where(and_(*conditions))

    if cursor:
        query = query.where(Signal.id < cursor)

    query = query.order_by(Signal.id.desc()).limit(limit + 1)

    result = await db.execute(query)
    signals = result.scalars().all()

    has_more = len(signals) > limit
    if has_more:
        signals = signals[:limit]

    next_cursor = signals[-1].id if has_more else None

    return PaginatedResponse(
        items=[SignalDetailResponse.model_validate(s) for s in signals],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/signals/{signal_id}", response_model=SignalDetailResponse)
async def get_signal(
    signal_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> SignalDetailResponse:
    """Get a single signal by ID with analysis and company."""
    query = (
        select(Signal)
        .options(
            selectinload(Signal.company),
            selectinload(Signal.analysis),
        )
        .where(Signal.id == signal_id)
    )

    result = await db.execute(query)
    signal = result.scalar_one_or_none()

    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Signal {signal_id} not found"},
        )

    return SignalDetailResponse.model_validate(signal)


@router.post("/signals", response_model=SignalResponse, status_code=status.HTTP_201_CREATED)
async def create_signal(
    signal_data: SignalCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> SignalResponse:
    """Create a new signal and trigger async analysis."""
    company = await db.get(Company, signal_data.company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Company {signal_data.company_id} not found"},
        )

    signal = Signal(
        sourceUrl=signal_data.source_url,
        sourceType=signal_data.source_type,
        title=signal_data.title,
        rawContent=signal_data.raw_content,
        publishedAt=signal_data.published_at,
        companyId=signal_data.company_id,
        status="PENDING",
    )

    db.add(signal)
    await db.flush()

    await db.refresh(signal, attribute_names=["company"])

    import asyncio
    asyncio.create_task(process_signal_analysis(signal.id))

    return SignalResponse.model_validate(signal)


@router.post("/signals/{signal_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def trigger_analysis(
    signal_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> dict:
    """Trigger analysis for an existing signal."""
    signal = await db.get(Signal, signal_id)
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Signal {signal_id} not found"},
        )

    if signal.status == "ANALYZED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "bad_request", "message": "Signal already analyzed"},
        )

    signal.status = "PENDING"
    await db.flush()

    import asyncio
    asyncio.create_task(process_signal_analysis(signal_id))

    return {"status": "accepted", "signal_id": signal_id}


@router.delete("/signals/{signal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_signal(
    signal_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> None:
    """Delete a signal."""
    signal = await db.get(Signal, signal_id)
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Signal {signal_id} not found"},
        )

    await db.delete(signal)
    await db.flush()

    return None
