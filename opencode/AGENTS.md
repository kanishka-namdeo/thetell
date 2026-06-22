# The Tell - Debug Agent Context

You are debugging **The Tell**, an AI-powered corporate intelligence platform built with Next.js 16.

## Architecture Overview

**Stack:**
- Next.js 16.2.9 (App Router)
- TypeScript
- Prisma ORM (PostgreSQL)
- OpenAI-compatible LLM (via custom provider at BASE_URL)
- Inngest for background jobs
- Transformers.js for local NLP (embeddings, entity extraction, sentiment)
- Docker Compose for local services

## Key Directories

```
src/
├── app/
│   ├── (dashboard)/           # Protected dashboard pages
│   │   ├── admin/             # Admin dashboard (users, analytics, audit, moderation, operations, intelligence)
│   │   ├── companies/         # Company management + detail + tracked subreddits
│   │   ├── inferences/        # Inference browser
│   │   ├── signals/           # Signal list + detail
│   │   ├── articles/          # Article list
│   │   ├── analytics/         # Charts and trends
│   │   ├── watchlist/         # Personal watchlist
│   │   ├── profile/           # User profile
│   │   └── settings/          # User settings
│   ├── (public)/              # Public pages (no auth required)
│   │   ├── page.tsx           # Public feed (home)
│   │   ├── signals/[id]/      # Signal detail with analysis sections
│   │   ├── articles/[id]/     # Article detail
│   │   ├── inferences/[id]/   # Inference detail
│   │   └── _components/       # Feed cards, search, trending themes, inference cards
│   ├── api/v1/
│   │   ├── admin/             # 31 admin API routes (users, content, moderation, pipelines, scrapers, etc.)
│   │   ├── signals/           # Signal CRUD + reanalyze + correlations
│   │   ├── articles/          # Article CRUD + generate
│   │   ├── companies/         # Company CRUD + enrich + subreddits + timeline
│   │   ├── inferences/        # Inference list + detail
│   │   ├── themes/            # Theme list with momentum
│   │   ├── search/            # Cross-entity search
│   │   ├── public/search/     # Public search (no auth)
│   │   ├── analyses/          # Analysis list
│   │   ├── analytics/         # Overview metrics
│   │   ├── watchlist/         # Personal watchlist
│   │   ├── profile/           # User profile
│   │   └── auth/              # Registration, password reset
│   └── api/inngest/           # Inngest webhook handler
├── lib/
│   ├── ai/
│   │   ├── provider.ts        # OpenAI-compatible provider (BASE_URL)
│   │   ├── confidence.ts      # Confidence scoring weights by source type
│   │   ├── prompts.ts         # Core analysis prompts
│   │   ├── types.ts           # AI types and Zod schemas
│   │   ├── url-discovery.ts   # LLM-driven URL discovery via Serper.dev
│   │   ├── hypothesis-generator.ts  # LLM-generated investigative questions
│   │   └── agent/             # Dual-agent system
│   │       ├── personas.ts    # ANALYST_CONFIG, GOSSIP_GIRL_CONFIG
│   │       ├── prompts.ts     # Agent voice prompt builders
│   │       ├── pipeline.ts    # analyzeSignalWithAgent()
│   │       ├── article-generator.ts  # generateArticleWithAgent()
│   │       ├── cross-signal-debate.ts  # Debate over accumulated evidence
│   │       ├── debate.ts      # Per-signal debate logic
│   │       ├── writing-rules.ts  # Writing style rules
│   │       └── types.ts       # AgentConfig, AgentAnalysis, Zod schemas
│   ├── scraping/              # 25 scrapers + base class + 2 trackers
│   │   ├── registry.ts        # Scraper registry (enable/disable, config)
│   │   ├── cache.ts           # PostgreSQL-backed response cache (24h TTL)
│   │   ├── base-scraper.ts    # Base scraper class
│   │   ├── feed-registry.ts   # Company -> feed URL mappings (121 feeds, 50+ companies)
│   │   ├── pipeline-registry.ts  # Pipeline registry for admin UI
│   │   ├── appstore-tracker.ts   # App Store top charts tracker
│   │   ├── domain-tracker.ts     # WHOIS domain registration tracker
│   │   └── [name]-scraper.ts     # 25 individual scrapers (see list below)
│   ├── nlp/                   # Local NLP with Transformers.js
│   │   ├── embedding-generator.ts  # Generate embeddings for signals
│   │   ├── embedding-store.ts      # Store/retrieve embeddings
│   │   ├── entity-extractor.ts     # Named entity recognition
│   │   ├── sentiment-classifier.ts # Local sentiment classification
│   │   ├── keyphrase-extractor.ts  # Key phrase extraction
│   │   ├── language-detector.ts    # Language detection
│   │   ├── quality-gate.ts         # Signal quality scoring
│   │   ├── model-cache.ts          # Model download/cache management
│   │   ├── fallbacks.ts            # Fallback logic when models unavailable
│   │   └── index.ts                # Re-exports
│   ├── enrichment/            # Company data enrichment pipeline
│   │   ├── website-probe.ts   # Probe company websites for feeds/links
│   │   ├── blog-discovery.ts  # Discover company blogs
│   │   ├── social-discovery.ts  # Discover social media accounts
│   │   ├── ticker-lookup.ts   # SEC ticker lookup
│   │   ├── types.ts           # Enrichment types
│   │   └── index.ts           # Re-exports
│   ├── reddit/                # Reddit integration
│   │   └── subreddit-discovery.ts  # LLM-driven subreddit discovery
│   ├── utils/
│   │   └── confidence.ts      # Confidence band utilities
│   ├── inngest/               # Background job functions
│   │   ├── functions.ts       # Main job definitions
│   │   ├── discovery.ts       # Scheduled signal discovery (13 steps)
│   │   ├── correlation.ts     # Cross-signal correlation engine
│   │   ├── calibration.ts     # Weekly prediction accuracy checking
│   │   ├── hypothesis.ts      # Hypothesis generation jobs
│   │   ├── enrichment.ts      # Company enrichment jobs
│   │   ├── company-discovery.ts  # Company data source discovery
│   │   └── subreddit-discovery.ts  # Reddit subreddit discovery jobs
│   ├── auth.ts                # NextAuth v5 configuration
│   ├── auth-edge.ts           # Edge-compatible auth helper
│   ├── db.ts                  # Prisma client singleton
│   ├── rate-limiter.ts        # Rate limiting
│   ├── audit-logger.ts        # Admin audit logging
│   └── api/schemas.ts         # Shared Zod schemas for API routes
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── dashboard/             # Dashboard-specific components
│   ├── admin/states/          # Admin loading/error/empty states
│   ├── layout/                # Layout + mobile nav
│   ├── empty/                 # Empty state components
│   ├── error/                 # Error boundary
│   ├── loading/               # Skeleton components
│   └── logo.tsx               # Brand logo component
├── hooks/                     # React hooks (use-signals, use-companies)
└── proxy.ts                   # Next.js middleware (auth, rate limiting, public routes)

prisma/
├── schema.prisma              # Database schema (27 models)
├── seed.ts                    # Demo seed data
└── seed-real.ts               # Real-world seed data

docker-compose.yml             # Local services (Postgres, Inngest, OpenCode)
```

## Signal Pipeline (Data Flow)

```
1. Company Enrichment (src/lib/enrichment/)
   ↓  Probe websites, discover blogs/social/tickers
2. URL Discovery (src/lib/ai/url-discovery.ts)
   ↓  LLM-driven search via Serper.dev
3. Subreddit Discovery (src/lib/reddit/subreddit-discovery.ts)
   ↓  LLM suggests relevant subreddits per company
4. Scraping (src/lib/scraping/registry.ts → 25 scrapers)
   ↓  Collect raw content from 17+ source types
5. Caching (src/lib/scraping/cache.ts)
   ↓  PostgreSQL-backed 24h TTL cache
6. NLP Processing (src/lib/nlp/)
   ↓  Embeddings, entity extraction, sentiment, language detection
7. Analysis (src/lib/ai/agent/pipeline.ts)
   ↓  Dual-agent analysis (Analyst + Gossip Girl)
8. Article Generation (src/lib/ai/agent/article-generator.ts)
   ↓  Persona-voiced articles from analysis
9. Hypothesis Generation (src/lib/ai/hypothesis-generator.ts)
   ↓  LLM generates investigative questions from patterns
10. Cross-Signal Correlation (src/lib/inngest/correlation.ts)
    ↓  Theme clustering, momentum tracking, inference generation
11. Cross-Signal Debate (src/lib/ai/agent/cross-signal-debate.ts)
    ↓  Dual agents debate accumulated evidence
12. Calibration (src/lib/inngest/calibration.ts)
       Weekly prediction accuracy checking
```

## Scrapers (25 total + 2 trackers)

**Core (7):** `blog-scraper.ts`, `filing-scraper.ts`, `job-scraper.ts`, `news-scraper.ts`, `rss-scraper.ts`, `social-scraper.ts`, `transcript-scraper.ts`

**Government/Legal (6):** `congress-scraper.ts`, `courtlistener-scraper.ts`, `fda-scraper.ts`, `sam-scraper.ts`, `uspto-scraper.ts`, `cert-transparency-scraper.ts`

**Extended (7):** `academic-scraper.ts`, `github-scraper.ts`, `press-release-scraper.ts`, `reddit-financial-scraper.ts`, `wayback-scraper.ts`, `lobbying-scraper.ts`, `exec-appearance-scraper.ts`

**New (5):** `app-store-scraper.ts`, `conference-scraper.ts`, `conference-agenda-scraper.ts`, `supplier-earning-scraper.ts`, `web-search-scraper.ts`

**Trackers (2):** `appstore-tracker.ts` (App Store charts), `domain-tracker.ts` (WHOIS)

## Database Models (27 total)

**Auth (4):** User, Account, Session, VerificationToken

**Core Domain (5):** Company, Signal, Analysis, Article, WatchedCompany

**Dual-Agent (2):** AgentDebate (per-signal), CrossSignalDebate (per-inference)

**Cross-Signal Correlation (4):** SignalTheme, Inference, InferenceCalibration, CompanyHypothesis

**Scraping (3):** ScrapeCache, PipelineRun, PipelineLog

**Reddit (2):** TrackedSubreddit, SubredditDiscoveryLog

**Enrichment (2):** CompanyDataSource, CompanyEnrichmentLog

**Admin (4):** AuditLog, SystemConfig, ModerationSettings, Job

**Enums:** Role, UserStatus, SourceType (18 values), ThemeStatus, InferenceStatus, HypothesisStatus, DebateStatus, SignalStatus, Sentiment, ArticleStatus, AgentPersona, DataOrigin

## Common Debug Scenarios

### "Company X has no signals"
Check:
1. Does company exist in DB? Query: `prisma.company.findUnique({ where: { id: "..." } })`
2. Does company have `CompanyDataSource` records? (RSS feeds, social accounts)
3. Check `src/lib/scraping/feed-registry.ts` — hardcoded feeds use string IDs like "amd", not UUIDs
4. Check if discovery was triggered: Look for `company/discovery.requested` Inngest event
5. Check individual scrapers: Do they return results for this company's feeds?
6. Check `PipelineRun` records for this company — are runs completing or failing?

### "Scraper X is failing"
Check:
1. Scraper implementation in `src/lib/scraping/[name]-scraper.ts`
2. Rate limiting in `src/lib/scraping/cache.ts`
3. HTTP errors — check if site is blocking requests
4. Parse errors — check if HTML structure changed
5. Is the scraper enabled in `src/lib/scraping/registry.ts`?
6. Check `PipelineRun` and `PipelineLog` for error details

### "Analysis is slow/wrong"
Check:
1. LLM provider config in `src/lib/ai/provider.ts`
2. Model being used (FAST_MODEL vs REASONING_MODEL env vars)
3. Prompt construction in `src/lib/ai/agent/prompts.ts`
4. Dual-agent system: Analyst vs Gossip Girl personas in `personas.ts`
5. Confidence scoring weights in `src/lib/ai/confidence.ts`

### "Background jobs not running"
Check:
1. Inngest dev server running? (docker-compose service)
2. Check `src/lib/inngest/functions.ts` for job definitions
3. Check Inngest dashboard at http://localhost:8288
4. Check `Job` model in DB for status/error details

### "No inferences generated"
Check:
1. Are there enough signals? Correlation requires 3+ signals from 2+ source types
2. Check `SignalTheme` records — are themes being created?
3. Check `src/lib/inngest/correlation.ts` for correlation logic
4. Check `SystemConfig` for `correlationConfidenceThreshold` and `minSignalsForCorrelation`
5. Check `Inference` model for existing records

### "NLP features not working"
Check:
1. Transformers.js models downloaded? Check `src/lib/nlp/model-cache.ts`
2. Check `src/lib/nlp/fallbacks.ts` — fallbacks activate when models unavailable
3. Check `src/lib/nlp/quality-gate.ts` for quality scoring thresholds
4. Embeddings stored in `Signal.embedding` JSON field

### "Enrichment not finding data sources"
Check:
1. Does company have a `websiteUrl`? Required for website probe
2. Check `CompanyEnrichmentLog` for enrichment run history
3. Check `CompanyDataSource` for discovered sources
4. Check `src/lib/enrichment/` for individual discovery logic

### "Admin pages not loading"
Check:
1. User has `ADMIN` role? Check `User.role` in DB
2. Admin routes protected by role checks in `src/proxy.ts`
3. Admin API routes under `src/app/api/v1/admin/`
4. Check `AuditLog` for admin action history

## Database Access

Use the Prisma MCP server to query the database:
- Company: `prisma.company`
- Signal: `prisma.signal`
- Analysis: `prisma.analysis`
- Article: `prisma.article`
- CompanyDataSource: `prisma.companyDataSource` (feeds/social accounts)
- Inference: `prisma.inference`
- SignalTheme: `prisma.signalTheme`
- CrossSignalDebate: `prisma.crossSignalDebate`
- PipelineRun: `prisma.pipelineRun`
- AuditLog: `prisma.auditLog`
- SystemConfig: `prisma.systemConfig`

## Environment Variables

Key vars (see `.env.local`):
- `API_KEY` — OpenAI-compatible API key
- `BASE_URL` — LLM endpoint (https://irhnglwoxe.a.pinggy.link/v1)
- `FAST_MODEL` — qwen3-coder-next
- `REASONING_MODEL` — qwen3.6-plus
- `DATABASE_URL` — PostgreSQL connection
- `BRAVE_API_KEY` — Web search for URL discovery
- `SERPER_API_KEY` — Google search API for URL discovery
- `NEXTAUTH_SECRET` — NextAuth session secret
- `NEXTAUTH_URL` — App URL (http://localhost:3000)

## Debugging Workflow

1. **Understand the problem** — What's the expected behavior vs actual?
2. **Check the database** — Use Prisma MCP to inspect records
3. **Trace the pipeline** — Where does data flow break? (enrichment → discovery → scraping → NLP → analysis → article → correlation → debate → calibration)
4. **Check logs** — Look at Inngest dashboard, Next.js console, PipelineLog records
5. **Test scrapers** — Run individual scrapers in isolation via `scripts/test-scrapers.ts`
6. **Verify LLM calls** — Check prompts, responses, token usage
7. **Check admin audit** — Query `AuditLog` for admin actions

## MCP Servers Available

You have access to:
- **Prisma** — Query the database
- **GitHub** — Check code history, PRs, issues
- **Chrome DevTools** — Inspect the running app
- **Playwright** — Browser automation for testing
- **Context7** — Search documentation
- **DeepWiki** — Search codebases
- **Sequential Thinking** — Multi-step reasoning
- **ESLint** — Check code quality
- **Vercel** — Deployment and environment info
- **Chakra UI** — Component library reference
- **Neo4j** — Graph database (if configured)

## Important Notes

- This is a **local development environment** — all data is local
- The app runs at http://localhost:3000
- Inngest dashboard at http://localhost:8288
- Database is PostgreSQL in Docker (port 5433)
- Use `pnpm` for package management (not npm/yarn)
- Follow existing code patterns — check similar implementations before writing new code
- Middleware is at `src/proxy.ts` (NOT `src/middleware.ts` — it was renamed for Next.js 16 compatibility)
- Admin dashboard has 6 sections: users, analytics, audit, moderation, operations, intelligence
- NLP runs locally via Transformers.js — no external API needed for embeddings/sentiment/entities
