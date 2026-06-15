"""API v1 router for companies."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.db.models import Company
from app.models.schemas import (
    CompanyResponse,
    CompanyDetailResponse,
    CompanyCreate,
    CompanyUpdate,
    PaginatedResponse,
)

router = APIRouter()


@router.get("/companies", response_model=PaginatedResponse)
async def list_companies(
    limit: int = 20,
    cursor: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> PaginatedResponse:
    """List all companies with cursor pagination."""
    query = select(Company)

    if cursor:
        query = query.where(Company.id < cursor)

    query = query.order_by(Company.id.desc()).limit(limit + 1)

    result = await db.execute(query)
    companies = result.scalars().all()

    has_more = len(companies) > limit
    if has_more:
        companies = companies[:limit]

    next_cursor = companies[-1].id if has_more else None

    return PaginatedResponse(
        items=[CompanyResponse.model_validate(c) for c in companies],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/companies/{company_id}", response_model=CompanyDetailResponse)
async def get_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> CompanyDetailResponse:
    """Get a single company by ID with recent signals and articles."""
    query = (
        select(Company)
        .options(
            selectinload(Company.signals),
            selectinload(Company.articles),
        )
        .where(Company.id == company_id)
    )

    result = await db.execute(query)
    company = result.scalar_one_or_none()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Company {company_id} not found"},
        )

    return CompanyDetailResponse.model_validate(company)


@router.post("/companies", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    company_data: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> CompanyResponse:
    """Create a new company."""
    existing = await db.execute(select(Company).where(Company.slug == company_data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "bad_request", "message": f"Company with slug '{company_data.slug}' already exists"},
        )

    company = Company(
        name=company_data.name,
        slug=company_data.slug,
        ticker=company_data.ticker,
        description=company_data.description,
        websiteUrl=company_data.website_url,
    )

    db.add(company)
    await db.flush()
    await db.refresh(company)

    return CompanyResponse.model_validate(company)


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    company_data: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> CompanyResponse:
    """Update a company."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Company {company_id} not found"},
        )

    update_data = company_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "website_url":
            setattr(company, "websiteUrl", value)
        else:
            setattr(company, field, value)

    await db.flush()
    await db.refresh(company)

    return CompanyResponse.model_validate(company)


@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
) -> None:
    """Delete a company."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Company {company_id} not found"},
        )

    await db.delete(company)
    await db.flush()

    return None
