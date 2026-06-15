# Features Built

**Last updated**: 2026-06-15

This document tracks all features built in The Tell application. Updated automatically after each feature implementation session.

**Format**: Each feature includes a Purpose column explaining WHY it exists (user value/problem solved), not just WHAT it is.

---

## Pages & Routes

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| Home Page | First impression — communicate product value proposition to investment analysts and corporate strategists | Landing page with hero section, newsprint aesthetic | `src/app/page.tsx` | ✅ Built |
| Dashboard Overview | Central hub for analysts to see key metrics and recent activity at a glance | Overview page with charts showing sentiment trends, confidence distribution, signal sources, and top insights | `src/app/(dashboard)/page.tsx` | ✅ Built |
| Signals List | Primary interface for analysts to monitor and filter public signals | Filterable table of signals with source type, status, sentiment, company filters; skeleton loading states | `src/app/(dashboard)/signals/page.tsx` | ✅ Built |
| Signal Detail | Deep dive into a specific signal's analysis and strategic implications | Signal metadata, AI analysis results (key facts, sentiment, confidence, themes), related signals | `src/app/(dashboard)/signals/[id]/page.tsx` | ✅ Built |
| Add Signal Page | Let analysts submit new public signals for AI analysis | Form with URL, source type, company, title, content fields; POSTs to API route which triggers backend analysis | `src/app/(dashboard)/signals/new/page.tsx` | ✅ Built |
| Companies List | Browse all tracked organizations and their signal/article counts | Grid of company cards with ticker, description, signal count, article count | `src/app/(dashboard)/companies/page.tsx` | ✅ Built |
| Company Detail | Comprehensive view of a single company's signals and articles | Company metadata, recent signals list, recent articles list, watchlist button | `src/app/(dashboard)/companies/[id]/page.tsx` | ✅ Built |
| Add Company Page | Let analysts register new organizations for monitoring | Form with name, slug, ticker, description, website; auto-generates slug from name | `src/app/(dashboard)/companies/new/page.tsx` | ✅ Built |
| Articles List | Browse AI-generated intelligence reports with filtering | Grid of article cards with company, status, author, date; filters by company and status | `src/app/(dashboard)/articles/page.tsx` | ✅ Built |
| Article Detail | Read full AI-generated analysis with safe markdown rendering | Article metadata, summary, full body rendered with react-markdown + rehype-sanitize (XSS-safe) | `src/app/(dashboard)/articles/[id]/page.tsx` | ✅ Built |
| Analytics Page | Data visualization for trend analysis and company comparison | Sentiment trends chart, confidence distribution, signal source breakdown, company comparison | `src/app/(dashboard)/analytics/page.tsx` | ✅ Built |
| Watchlist Page | Track personally important companies and their recent signals | List of watched companies with recent signals, quick navigation to details | `src/app/(dashboard)/watchlist/page.tsx` | ✅ Built |
| User Profile Page | View and edit personal account information | Display user info (name, email, role), allow name/email updates, show account creation date | `src/app/(dashboard)/profile/page.tsx` | ✅ Built |
| User Settings Page | Configure notification preferences and analysis thresholds | Notification preferences, default confidence threshold for alerts | `src/app/(dashboard)/settings/page.tsx` | ✅ Built |
| Sign In Page | Secure authentication for authorized users | NextAuth v5 sign-in form with email/password | `src/app/sign-in/page.tsx` | ✅ Built |
| Sign Up Page | New user registration | Registration form with name, email, password | `src/app/sign-up/page.tsx` | ✅ Built |

## Components

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| UI Components | Provide consistent, accessible interactive elements across all pages | Button, Card, Input, Badge, Separator, Skeleton, Tabs, Dialog (shadcn/ui primitives) | `src/components/ui/` | ✅ Built |
| Layout Components | Enforce editorial grid structure and information density | Container, Grid, Section (12-column grid, collapsed borders) | `src/components/layout/` | ✅ Built |
| Typography Components | Establish visual hierarchy for signal analysis content | Headline, Body, Label, Metadata, Ornament (serif headlines, clean body) | `src/components/typography/` | ✅ Built |
| Icon Component | Visual communication for status indicators and actions | Unified icon wrapper for lucide-react (3 sizes, bordered variants) | `src/components/icons/icon.tsx` | ✅ Built |
| Dashboard Components | Reusable dashboard-specific UI elements | SignalTable, SignalFilters, CompanyCard, ArticleCard, ConfidenceBadge, SentimentIndicator, SearchBar | `src/components/dashboard/` | ✅ Built |
| Search Bar | Quick cross-entity search for signals, companies, articles | Debounced search input with dropdown results grouped by type, click to navigate | `src/components/dashboard/search-bar.tsx` | ✅ Built |
| Safe Markdown | Render user-generated markdown content without XSS vulnerabilities | react-markdown + rehype-sanitize wrapper for article body rendering | `src/components/dashboard/safe-markdown.tsx` | ✅ Built |
| Analytics Charts | Visualize trends and distributions for strategic analysis | Recharts-based charts: sentiment trends, confidence distribution, source breakdown | `src/components/dashboard/` | ✅ Built |
| Error Boundary | Graceful error handling with user-friendly recovery | Dashboard error.tsx with retry button, not-found.tsx for 404s | `src/app/(dashboard)/` | ✅ Built |

## Backend Features

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| SQLAlchemy ORM Models | Map Prisma-managed PostgreSQL tables to Python ORM objects for backend queries | Async SQLAlchemy models (Company, Signal, Analysis, Article, User) matching Prisma schema | `backend/app/db/models.py` | ✅ Built |
| Async Database Session | Provide connection pooling and session management for async FastAPI routes | asyncpg engine, session factory, `get_db()` dependency with auto-commit/rollback | `backend/app/db/session.py` | ✅ Built |
| API Key Authentication | Secure backend endpoints against unauthorized access | `X-API-Key` header dependency wired into all `/api/v1/*` routes, returns 401 for missing/invalid keys | `backend/app/api/deps.py` | ✅ Built |
| Signals API | Allow frontend to list, create, and delete signals with filtering | CRUD endpoints with cursor pagination, filters (companyId, sourceType, status, sentiment), nested analysis/company | `backend/app/api/v1/signals.py` | ✅ Built |
| Companies API | Allow frontend to manage company records | CRUD endpoints with cursor pagination, slug uniqueness check, nested signals/articles | `backend/app/api/v1/companies.py` | ✅ Built |
| Analyses API | Allow frontend to query AI analysis results with filtering | List endpoint with filters (companyId, sentiment, confidence range), cursor pagination | `backend/app/api/v1/analyses.py` | ✅ Built |
| Articles API | Allow frontend to list articles and trigger article generation | List/get endpoints with filters, `POST /articles/generate` triggers LLM article generation from analysis IDs | `backend/app/api/v1/articles.py` | ✅ Built |
| Search API | Enable cross-entity search across signals, companies, articles | GET endpoint with query param `q`, case-insensitive search, returns grouped results (5 per type) | `src/app/api/v1/search/route.ts` | ✅ Built |
| Background Analysis Task | Automatically run AI analysis pipeline when a signal is created | `asyncio.create_task` background worker: status PENDING→ANALYZING→ANALYZED/FAILED, stores results in Analysis table | `backend/app/tasks/analysis.py` | ✅ Built |
| Pydantic Response Schemas | Serialize ORM models to JSON with proper field mapping | Response schemas with `from_attributes=True`, request schemas with validation | `backend/app/models/schemas.py` | ✅ Built |
| Database Schema | Persistent storage for all entities with relational integrity | Prisma schema with 7 models (User, Account, Session, Company, Signal, Analysis, Article, WatchedCompany), migrations, seed data | `prisma/schema.prisma` | ✅ Built |
| NextAuth v5 Integration | Secure session-based authentication for frontend users | NextAuth v5 with credentials provider, session management, protected routes | `src/lib/auth.ts` | ✅ Built |

## Infrastructure

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| Docker PostgreSQL | Local development database with persistence | PostgreSQL 16 container on port 5433, thell_user/thetell_password, pgdata volume | `docker-compose.yml` | ✅ Built |
| Environment Configuration | Manage secrets and config across environments | .env files for backend/frontend, Pydantic Settings for validation, Docker Compose env vars | `.env`, `backend/.env`, `.env.local` | ✅ Built |
| Prisma Migrations | Version-controlled database schema changes | Initial migration with all tables, seed script for demo data | `prisma/migrations/` | ✅ Built |

## Planned Features (Not Yet Built)

These features are planned to deliver the core product vision. Each includes the strategic rationale.

| Feature | Purpose | Description | Status |
|---------|---------|-------------|--------|
| Signal Ingestion Pipeline | Collect public company signals from multiple sources (news, filings, transcripts, social) | Scraping pipeline with rate limiting, caching, retry logic | 🚧 Not Started |
| AI Analysis Engine | Extract facts, classify sentiment, identify strategic themes from raw signals | LLM abstraction layer (OpenAI/Anthropic), prompt templates, structured output parsing | 🚧 Not Started |
| Inference Engine | Connect signals across types to predict corporate intent — the core differentiator | Cross-signal pattern detection, confidence scoring, strategic theme clustering | 🚧 Not Started |
| Alert System | Notify users when high-confidence inferences are detected for tracked companies | Email/in-app notifications, confidence thresholds, company watchlists | 🚧 Not Started |
