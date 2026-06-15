"""API v1 router aggregation."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.analyses import router as analyses_router
from app.api.v1.articles import router as articles_router
from app.api.v1.companies import router as companies_router
from app.api.v1.signals import router as signals_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(companies_router, tags=["companies"])
api_router.include_router(signals_router, tags=["signals"])
api_router.include_router(analyses_router, tags=["analyses"])
api_router.include_router(articles_router, tags=["articles"])
