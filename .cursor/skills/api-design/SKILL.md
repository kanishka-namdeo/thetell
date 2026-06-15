---
name: api-design
description: Use when designing REST API endpoints, creating FastAPI routers, defining request/response schemas, or implementing pagination, filtering, and error handling for the backend API
---

# API Design

## Overview

Design **RESTful, consistent, and well-documented** APIs using FastAPI. Every endpoint should have clear request/response schemas, proper error handling, and follow REST conventions.

## When to Use

- Creating new API endpoints
- Designing request/response schemas
- Implementing pagination or filtering
- Adding error handling to routes
- Structuring FastAPI routers

## Core Pattern

### Before: Ad-hoc Endpoints (Problematic)

```python
# Bad: Inconsistent, no schemas, no error handling
from fastapi import APIRouter

router = APIRouter()

@router.get("/get_signals")
async def get_signals():
    signals = db.query("SELECT * FROM signals")
    return {"data": [dict(s) for s in signals]}

@router.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    result = analyze_text(data["text"])
    return result
```

**Problems:**
- Non-standard endpoint names (`/get_signals` instead of `/signals`)
- No request/response schemas
- No error handling
- No pagination
- Inconsistent response format

### After: Structured, RESTful API

```python
# Good: RESTful, typed, with error handling
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from uuid import UUID

router = APIRouter(prefix="/api/v1", tags=["signals"])

# --- Schemas ---

class SignalSummary(BaseModel):
    id: UUID
    source_url: str
    source_type: str
    scraped_at: datetime
    has_analysis: bool

class SignalDetail(SignalSummary):
    raw_text: str
    analysis: Analysis | None = None

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    pages: int

class ErrorResponse(BaseModel):
    detail: str
    error_code: str
    context: dict | None = None

# --- Endpoints ---

@router.get("/signals", response_model=PaginatedResponse)
async def list_signals(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    source_type: str | None = Query(None, description="Filter by source type"),
):
    """List all signals with pagination and filtering."""
    query = Signal.query()
    
    if source_type:
        query = query.filter(Signal.source_type == source_type)
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return PaginatedResponse(
        items=[SignalSummary.from_orm(s) for s in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )

@router.get("/signals/{signal_id}", response_model=SignalDetail)
async def get_signal(signal_id: UUID):
    """Get a single signal by ID."""
    signal = await Signal.get(signal_id)
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Signal {signal_id} not found",
        )
    return SignalDetail.from_orm(signal)

@router.post("/signals", response_model=SignalSummary, status_code=status.HTTP_201_CREATED)
async def create_signal(signal_in: SignalCreate):
    """Create a new signal."""
    signal = await Signal.create(**signal_in.model_dump())
    return SignalSummary.from_orm(signal)
```

## Quick Reference

| Aspect | Rule |
|--------|------|
| **Endpoint naming** | Plural nouns: `/signals`, `/articles` |
| **HTTP methods** | GET (read), POST (create), PUT (update), DELETE (remove) |
| **Status codes** | 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Server Error |
| **Pagination** | `page` + `page_size` query params, return total |
| **Filtering** | Query params for each filterable field |
| **Error format** | Consistent `ErrorResponse` schema |
| **Versioning** | URL prefix: `/api/v1/` |
| **Tags** | Group routers by domain |

### RESTful Endpoint Design

| Operation | Method | Endpoint | Status |
|-----------|--------|----------|--------|
| List signals | GET | `/api/v1/signals` | 200 |
| Get signal | GET | `/api/v1/signals/{id}` | 200 |
| Create signal | POST | `/api/v1/signals` | 201 |
| Update signal | PUT | `/api/v1/signals/{id}` | 200 |
| Delete signal | DELETE | `/api/v1/signals/{id}` | 204 |
| Trigger analysis | POST | `/api/v1/signals/{id}/analyze` | 202 |

### Error Response Format

```python
# Consistent error format across all endpoints
class ErrorResponse(BaseModel):
    detail: str
    error_code: str
    context: dict | None = None

# Usage
@router.get("/signals/{signal_id}")
async def get_signal(signal_id: UUID):
    signal = await Signal.get(signal_id)
    if not signal:
        raise HTTPException(
            status_code=404,
            detail={
                "detail": f"Signal {signal_id} not found",
                "error_code": "SIGNAL_NOT_FOUND",
                "context": {"signal_id": str(signal_id)},
            },
        )
    return signal
```

## Common Mistakes

### Mistake 1: Verb-based endpoints

**Problem:** Not RESTful, harder to document.

```python
# Bad: Verb-based
@router.get("/get_signals")
@router.post("/create_signal")
@router.post("/delete_signal")

# Good: Noun-based with HTTP methods
@router.get("/signals")        # List
@router.post("/signals")       # Create
@router.delete("/signals/{id}") # Delete
```

### Mistake 2: No request/response schemas

**Problem:** No validation, no docs, no type safety.

```python
# Bad: Raw dicts
@router.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    return {"result": data["text"]}

# Good: Pydantic schemas
class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    signal_type: SignalType | None = None

class AnalyzeResponse(BaseModel):
    analysis: Analysis
    processing_time_ms: float

@router.post("/signals/{signal_id}/analyze", response_model=AnalyzeResponse)
async def analyze_signal(signal_id: UUID, req: AnalyzeRequest):
    analysis = await run_analysis(signal_id, req.text, req.signal_type)
    return AnalyzeResponse(analysis=analysis, processing_time_ms=...)
```

### Mistake 3: No pagination

**Problem:** Large datasets crash the client, slow responses.

```python
# Bad: Return everything
@router.get("/signals")
async def list_signals():
    return await Signal.all()  # Could be millions!

# Good: Paginated
@router.get("/signals", response_model=PaginatedResponse)
async def list_signals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    total = await Signal.count()
    items = await Signal.offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(
        items=items, total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )
```

### Mistake 4: Inconsistent error handling

**Problem:** Clients can't handle errors uniformly.

```python
# Bad: Different error formats
@router.get("/signals/{id}")
async def get_signal(id: UUID):
    signal = await Signal.get(id)
    if not signal:
        return {"error": "not found"}  # 200 with error in body!

# Good: HTTP status codes + consistent format
@router.get("/signals/{id}")
async def get_signal(id: UUID):
    signal = await Signal.get(id)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return signal
```

### Mistake 5: No API versioning

**Problem:** Breaking changes break existing clients.

```python
# Bad: No versioning
router = APIRouter()

# Good: Version prefix
router = APIRouter(prefix="/api/v1")

# Future: /api/v2 when breaking changes needed
```

## Tools

- **FastAPI** - Web framework with automatic OpenAPI docs
- **Pydantic** - Request/response validation
- **Uvicorn** - ASGI server
- **httpx** - Testing API endpoints
- **OpenAPI** - Auto-generated API documentation

## Router Organization

```python
# app/routers/__init__.py
from fastapi import APIRouter
from . import signals, articles, analysis

api_router = APIRouter()
api_router.include_router(signals.router, prefix="/api/v1")
api_router.include_router(articles.router, prefix="/api/v1")
api_router.include_router(analysis.router, prefix="/api/v1")
```

```python
# app/routers/signals.py
from fastapi import APIRouter

router = APIRouter(tags=["signals"])

@router.get("/signals")
async def list_signals(): ...
```
