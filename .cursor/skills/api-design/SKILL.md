---
name: api-design
description: Use when designing REST API endpoints, creating Next.js Route Handlers, defining Zod schemas for validation, or implementing pagination, filtering, and error handling for the API
---

# API Design

## Overview

Design **RESTful, consistent, and well-documented** APIs using Next.js Route Handlers. Every endpoint should have clear Zod schemas for validation, proper error handling, and follow REST conventions.

## When to Use

- Creating new API endpoints in `src/app/api/v1/`
- Designing request/response schemas with Zod
- Implementing cursor-based pagination or filtering
- Adding error handling to routes
- Structuring Next.js Route Handlers

## Core Pattern

### Before: Ad-hoc Endpoints (Problematic)

```typescript
// Bad: Inconsistent, no schemas, no error handling
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const signals = await prisma.signal.findMany();
  return NextResponse.json({ data: signals });
}

export async function POST(req: Request) {
  const data = await req.json();
  const result = await analyzeText(data.text);
  return NextResponse.json(result);
}
```

**Problems:**
- Non-standard endpoint names (`/get_signals` instead of `/signals`)
- No request/response validation with Zod
- No error handling
- No pagination
- Inconsistent response format

### After: Structured, RESTful API

```typescript
// Good: RESTful, typed, with error handling
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// --- Schemas ---

const SignalSummarySchema = z.object({
  id: z.string().uuid(),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["NEWS", "FILING", "TRANSCRIPT", "SOCIAL"]),
  scrapedAt: z.string().datetime(),
  hasAnalysis: z.boolean(),
});

const PaginatedResponseSchema = z.object({
  items: z.array(SignalSummarySchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.record(z.array(z.string())).optional(),
});

// --- Endpoints ---

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const cursor = searchParams.get("cursor");
    const sourceType = searchParams.get("sourceType");

    const where: any = {};
    if (sourceType) where.sourceType = sourceType;

    const signals = await prisma.signal.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { scrapedAt: "desc" },
    });

    const hasMore = signals.length > limit;
    const items = hasMore ? signals.slice(0, limit) : signals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch signals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sourceUrl, sourceType, title, rawContent, companyId } = body;

    if (!sourceUrl || !sourceType || !title || !rawContent || !companyId) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Missing required fields",
          details: {
            sourceUrl: !sourceUrl ? ["Required"] : undefined,
            sourceType: !sourceType ? ["Required"] : undefined,
          },
        },
        { status: 400 }
      );
    }

    const signal = await prisma.signal.create({
      data: { sourceUrl, sourceType, title, rawContent, companyId },
    });

    return NextResponse.json(signal, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create signal" },
      { status: 500 }
    );
  }
}
```

## Quick Reference

| Aspect | Rule |
|--------|------|
| **Endpoint naming** | Plural nouns: `/signals`, `/articles` |
| **HTTP methods** | GET (read), POST (create), PUT (update), DELETE (remove) |
| **Status codes** | 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Server Error |
| **Pagination** | Cursor-based with `cursor` + `limit` query params |
| **Filtering** | Query params for each filterable field |
| **Error format** | Consistent `{ error, message, details? }` structure |
| **Versioning** | URL prefix: `/api/v1/` |
| **Validation** | Zod schemas for all request/response data |

### RESTful Endpoint Design

| Operation | Method | Endpoint | Status |
|-----------|--------|----------|--------|
| List signals | GET | `/api/v1/signals` | 200 |
| Get signal | GET | `/api/v1/signals/{id}` | 200 |
| Create signal | POST | `/api/v1/signals` | 201 |
| Update signal | PUT | `/api/v1/signals/{id}` | 200 |
| Delete signal | DELETE | `/api/v1/signals/{id}` | 204 |
| Trigger analysis | POST | `/api/v1/signals/{id}/reanalyze` | 202 |

### Error Response Format

```typescript
// Consistent error format across all endpoints
interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

// Usage
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const signal = await prisma.signal.findUnique({
    where: { id: params.id },
  });
  
  if (!signal) {
    return NextResponse.json(
      {
        error: "not_found",
        message: `Signal ${params.id} not found`,
      },
      { status: 404 }
    );
  }
  
  return NextResponse.json(signal);
}
```

## Common Mistakes

### Mistake 1: Verb-based endpoints

**Problem:** Not RESTful, harder to document.

```typescript
// Bad: Verb-based
// POST /api/v1/get_signals
// POST /api/v1/create_signal
// POST /api/v1/delete_signal

// Good: Noun-based with HTTP methods
// GET /api/v1/signals        (List)
// POST /api/v1/signals       (Create)
// DELETE /api/v1/signals/{id} (Delete)
```

### Mistake 2: No request/response schemas

**Problem:** No validation, no type safety, runtime errors.

```typescript
// Bad: Raw objects
export async function POST(req: Request) {
  const data = await req.json();
  return NextResponse.json({ result: data.text });
}

// Good: Zod schemas
const AnalyzeRequestSchema = z.object({
  text: z.string().min(1).max(10000),
  signalType: z.enum(["NEWS", "FILING", "TRANSCRIPT"]).optional(),
});

const AnalyzeResponseSchema = z.object({
  analysis: z.any(),
  processingTimeMs: z.number(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = AnalyzeRequestSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }
  
  const analysis = await runAnalysis(parsed.data.text, parsed.data.signalType);
  return NextResponse.json({
    analysis,
    processingTimeMs: Date.now() - startTime,
  });
}
```

### Mistake 3: No pagination

**Problem:** Large datasets crash the client, slow responses.

```typescript
// Bad: Return everything
export async function GET() {
  const signals = await prisma.signal.findMany(); // Could be millions!
  return NextResponse.json(signals);
}

// Good: Cursor-based pagination
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const cursor = searchParams.get("cursor");
  
  const signals = await prisma.signal.findMany({
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { scrapedAt: "desc" },
  });
  
  const hasMore = signals.length > limit;
  const items = hasMore ? signals.slice(0, limit) : signals;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  
  return NextResponse.json({
    items,
    nextCursor,
    hasMore,
  });
}
```

### Mistake 4: Inconsistent error handling

**Problem:** Clients can't handle errors uniformly.

```typescript
// Bad: Different error formats
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const signal = await prisma.signal.findUnique({ where: { id: params.id } });
  if (!signal) {
    return NextResponse.json({ error: "not found" }); // 200 with error in body!
  }
  return NextResponse.json(signal);
}

// Good: HTTP status codes + consistent format
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const signal = await prisma.signal.findUnique({ where: { id: params.id } });
    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(signal);
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch signal" },
      { status: 500 }
    );
  }
}
```

### Mistake 5: No API versioning

**Problem:** Breaking changes break existing clients.

```typescript
// Bad: No versioning
// src/app/api/signals/route.ts

// Good: Version prefix
// src/app/api/v1/signals/route.ts

// Future: /api/v2/signals when breaking changes needed
```

## Tools

- **Next.js Route Handlers** - API endpoints in `src/app/api/`
- **Zod** - Request/response validation and type inference
- **Prisma** - Database ORM with type-safe queries
- **NextAuth** - Authentication and session management

## Route Handler Organization

```typescript
// src/app/api/v1/signals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // List signals
}

export async function POST(req: NextRequest) {
  // Create signal
}
```

```typescript
// src/app/api/v1/signals/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Get single signal
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Update signal
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Delete signal
}
```

## Related Skills

- **data-modeling** - Zod schema design and Prisma models
- **llm-abstraction** - LLM provider abstraction for AI features
- **testing-strategies** - Testing API routes with Vitest and MSW
