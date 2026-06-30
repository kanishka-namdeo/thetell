# The Tell - Complete Sitemap

**Generated:** June 22, 2026
**App Version:** Next.js 16.2.9

---

## Overview

This document maps all routes in The Tell application, organized by access level and functional area.

**Route Groups:**
- `(public)` - No authentication required
- `(auth)` - Authentication flows
- `dashboard` - Authenticated user area
- `dashboard/admin` - Admin-only area
- `api/v1` - REST API endpoints
- `api/inngest` - Background job webhook

---

## Public Routes (No Auth Required)

| Route | Description | Layout |
|-------|-------------|--------|
| `/` | Public signal feed (homepage) | `(public)` |
| `/signals/[id]` | Signal detail page | `(public)` |
| `/articles/[id]` | Article detail page | `(public)` |
| `/inferences/[id]` | Inference detail page | `(public)` |

---

## Authentication Routes

| Route | Description | Layout |
|-------|-------------|--------|
| `/sign-in` | User sign in | `(auth)` |
| `/sign-up` | User registration | `(auth)` |
| `/forgot-password` | Password reset request | `(auth)` |
| `/reset-password` | Password reset confirmation | `(auth)` |

---

## Dashboard Routes (Authenticated)

### Main Navigation

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard` | Dashboard overview | `dashboard` |
| `/dashboard/signals` | Signal list | `dashboard` |
| `/dashboard/signals/[id]` | Signal detail | `dashboard` |
| `/dashboard/signals/new` | Create new signal | `dashboard` |
| `/dashboard/companies` | Company list | `dashboard` |
| `/dashboard/companies/[id]` | Company detail | `dashboard` |
| `/dashboard/companies/new` | Add new company | `dashboard` |
| `/dashboard/articles` | Article list | `dashboard` |
| `/dashboard/articles/[id]` | Article detail | `dashboard` |
| `/dashboard/inferences` | Inference list | `dashboard` |
| `/dashboard/inferences/[id]` | Inference detail | `dashboard` |
| `/dashboard/analytics` | Analytics dashboard | `dashboard` |
| `/dashboard/watchlist` | Personal watchlist | `dashboard` |

### User Account

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard/profile` | User profile | `dashboard` |
| `/dashboard/settings` | User settings | `dashboard` |

---

## Admin Dashboard Routes (Admin Only)

### Admin Overview

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard/admin` | Admin overview | `dashboard/admin` |
| `/dashboard/admin/analytics` | System analytics | `dashboard/admin` |
| `/dashboard/admin/audit` | Audit logs | `dashboard/admin` |
| `/dashboard/admin/debug` | Debug tools | `dashboard/admin` |
| `/dashboard/admin/users` | User management | `dashboard/admin` |
| `/dashboard/admin/users/[id]` | User detail | `dashboard/admin` |
| `/dashboard/admin/settings` | System settings | `dashboard/admin` |

### Intelligence Section

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard/admin/intelligence` | Intelligence overview | `dashboard/admin` |
| `/dashboard/admin/intelligence/themes` | Theme management | `dashboard/admin` |
| `/dashboard/admin/intelligence/hypotheses` | Hypothesis management | `dashboard/admin` |
| `/dashboard/admin/intelligence/inferences` | Inference management | `dashboard/admin` |

### Content Section

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard/admin/content` | Content queue | `dashboard/admin/content` |
| `/dashboard/admin/content/library` | Content library | `dashboard/admin/content` |
| `/dashboard/admin/content/settings` | Content settings | `dashboard/admin/content` |

### Operations Section

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard/admin/operations` | Operations health | `dashboard/admin/operations` |
| `/dashboard/admin/operations/scrapers` | Scraper management | `dashboard/admin/operations` |
| `/dashboard/admin/operations/subreddits` | Subreddit management | `dashboard/admin/operations` |
| `/dashboard/admin/operations/jobs` | Job monitoring | `dashboard/admin/operations` |
| `/dashboard/admin/operations/pipelines` | Pipeline overview | `dashboard/admin/operations` |
| `/dashboard/admin/operations/pipelines/[id]` | Pipeline detail | `dashboard/admin/operations` |

---

## Shared Debug Routes

| Route | Description | Layout |
|-------|-------------|--------|
| `/dashboard/admin/debug/shared/[token]` | Shared debug session | `(dashboard)` |

---

## API Routes

### Authentication API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/[...nextauth]` | ALL | NextAuth.js endpoints |
| `/api/v1/auth/register` | POST | User registration |
| `/api/v1/auth/forgot-password` | POST | Request password reset |
| `/api/v1/auth/reset-password` | POST | Confirm password reset |
| `/api/v1/auth/verify-email` | POST | Email verification |

### Signals API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/signals` | GET, POST | List/create signals |
| `/api/v1/signals/[id]` | GET, PATCH, DELETE | Signal CRUD |
| `/api/v1/signals/[id]/reanalyze` | POST | Reanalyze signal |
| `/api/v1/signals/[id]/correlations` | GET | Signal correlations |

### Articles API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/articles` | GET, POST | List/create articles |
| `/api/v1/articles/[id]` | GET, PATCH, DELETE | Article CRUD |
| `/api/v1/articles/generate` | POST | Generate article |

### Companies API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/companies` | GET, POST | List/create companies |
| `/api/v1/companies/[id]` | GET, PATCH, DELETE | Company CRUD |
| `/api/v1/companies/[id]/timeline` | GET | Company timeline |
| `/api/v1/companies/[id]/enrich` | POST | Enrich company data |
| `/api/v1/companies/[id]/subreddits` | GET, POST | List/add subreddits |
| `/api/v1/companies/[id]/subreddits/discover` | POST | Discover subreddits |
| `/api/v1/companies/[id]/subreddits/[subredditId]` | DELETE | Remove subreddit |

### Inferences API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/inferences` | GET | List inferences |
| `/api/v1/inferences/[id]` | GET | Get inference |
| `/api/v1/themes` | GET | List themes |
| `/api/v1/analyses` | GET | List analyses |

### Search API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/search` | GET | Search (authenticated) |
| `/api/v1/public/search` | GET | Public search |

### Watchlist API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/watchlist` | GET | Get watchlist |
| `/api/v1/watchlist/[companyId]` | POST, DELETE | Add/remove from watchlist |

### Profile API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/profile` | GET, PATCH | Get/update profile |

### Analytics API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/analytics/overview` | GET | Overview metrics |

---

## Admin API Routes

### Admin Users API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/users` | GET, POST | List/create users |
| `/api/v1/admin/users/[id]` | GET, PATCH, DELETE | User CRUD |
| `/api/v1/admin/users/[id]/reset-password` | POST | Reset user password |

### Admin Content API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/content` | GET | Content queue |
| `/api/v1/admin/content/signals/[id]` | GET, PATCH | Signal moderation |
| `/api/v1/admin/content/signals/[id]/reanalyze` | POST | Reanalyze signal |
| `/api/v1/admin/content/articles/[id]` | GET, PATCH | Article moderation |

### Admin Moderation API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/moderation/signals` | GET | Signals awaiting moderation |
| `/api/v1/admin/moderation/signals/[id]/approve` | POST | Approve signal |
| `/api/v1/admin/moderation/signals/[id]/reject` | POST | Reject signal |
| `/api/v1/admin/moderation/articles` | GET | Articles awaiting moderation |
| `/api/v1/admin/moderation/articles/[id]/approve` | POST | Approve article |
| `/api/v1/admin/moderation/articles/[id]/reject` | POST | Reject article |
| `/api/v1/admin/moderation/bulk` | POST | Bulk moderation actions |
| `/api/v1/admin/moderation/settings` | GET, PATCH | Moderation settings |

### Admin Operations API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/system/health` | GET | System health |
| `/api/v1/admin/scrapers` | GET | List scrapers |
| `/api/v1/admin/scrapers/[name]` | GET, POST | Scraper detail/control |
| `/api/v1/admin/pipelines` | GET | List pipelines |
| `/api/v1/admin/pipelines/[companyId]` | GET, POST | Pipeline detail/run |
| `/api/v1/admin/pipelines/[companyId]/run` | POST | Run pipeline |
| `/api/v1/admin/jobs` | GET | List jobs |

### Admin Intelligence API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/hypotheses` | GET, POST | List/create hypotheses |
| `/api/v1/admin/hypotheses/[id]` | GET, PATCH, DELETE | Hypothesis CRUD |

### Admin Analytics API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/analytics` | GET | Admin analytics |

### Admin Audit API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/audit` | GET | Audit logs |

### Admin Settings API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/settings` | GET, PATCH | System settings |

### Admin Debug API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/debug/start` | POST | Start debug session |
| `/api/v1/admin/debug/status` | GET | Debug status |
| `/api/v1/admin/debug/stream` | GET | Debug event stream |
| `/api/v1/admin/debug/sessions` | GET | List sessions |
| `/api/v1/admin/debug/session/[id]` | GET, DELETE | Session detail/delete |
| `/api/v1/admin/debug/session/[id]/follow-up` | POST | Follow-up query |
| `/api/v1/admin/debug/session/[id]/prompt` | GET | Get prompt |
| `/api/v1/admin/debug/session/[id]/share` | POST | Share session |
| `/api/v1/admin/debug/templates` | GET | Debug templates |
| `/api/v1/admin/debug/file` | GET | File reference |
| `/api/v1/admin/debug/git` | GET | Git info |

### Admin System API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/admin/warm-nlp` | POST | Warm NLP models |
| `/api/v1/admin/nlp-stats` | GET | NLP statistics |

---

## Background Jobs

| Route | Method | Description |
|-------|--------|-------------|
| `/api/inngest` | ALL | Inngest webhook handler |

---

## Route Summary

### By Access Level

| Category | Count | Routes |
|----------|-------|--------|
| Public Pages | 4 | `/`, `/signals/[id]`, `/articles/[id]`, `/inferences/[id]` |
| Auth Pages | 4 | `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` |
| Dashboard Pages | 17 | Main dashboard + user account routes |
| Admin Pages | 23 | Admin overview + nested sections |
| Shared Debug | 1 | `/dashboard/admin/debug/shared/[token]` |
| API Endpoints | 70 | REST API routes |

### Total Routes

- **Page Routes:** 49
- **API Routes:** 70
- **Total:** 119 routes

---

## Layout Hierarchy

```
Root Layout (src/app/layout.tsx)
├── (public)/layout.tsx
│   ├── / (public feed)
│   ├── /signals/[id]
│   ├── /articles/[id]
│   └── /inferences/[id]
├── (auth)/layout.tsx
│   ├── /sign-in
│   ├── /sign-up
│   ├── /forgot-password
│   └── /reset-password
└── dashboard/layout.tsx
    ├── /dashboard/*
    ├── dashboard/admin/layout.tsx
    │   └── /dashboard/admin/*
    ├── dashboard/admin/content/layout.tsx
    │   └── /dashboard/admin/content/*
    ├── dashboard/admin/intelligence/layout.tsx
    │   └── /dashboard/admin/intelligence/*
    ├── dashboard/admin/operations/layout.tsx
    │   └── /dashboard/admin/operations/*
    └── (dashboard)/dashboard/admin/debug/shared/[token]
```

---

## Key Features by Section

### Public Feed
- Browse signals without authentication
- Search functionality
- Signal, article, and inference detail views

### Dashboard
- Signal monitoring and management
- Company tracking
- Article reading
- Inference exploration
- Analytics and trends
- Personal watchlist
- User profile and settings

### Admin Panel
- **Overview:** System status and quick actions
- **Analytics:** Detailed system metrics
- **Audit:** Complete action logging
- **Debug:** AI-powered debugging tools
- **Users:** User management and permissions
- **Settings:** System configuration
- **Intelligence:** Theme, hypothesis, and inference management
- **Content:** Content moderation queue and library
- **Operations:** Scraper control, job monitoring, pipeline management

### API
- Full REST API for all entities
- Authentication via NextAuth.js
- Admin-only endpoints for management
- Background job processing via Inngest
