<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes â€” APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The Tell - Project Structure

**The Tell** is an AI system that reads public company signals and infers inner workings. It's a Next.js 16.2.9 application with integrated TypeScript AI layer.

## Current State (as of 2026-06-22)

**Built:**
- Design system (newsprint aesthetic, shadcn/ui components, typography, layout)
- Public signal feed (casual browsing without login, replaces static landing page)
- Public signal, article, and inference detail pages (read-only, no auth required)
- Component library (UI primitives, layout, typography, icons)
- Project structure and configuration
- Database layer (Prisma schema with 27 models, migrations)
- Signal dashboard with filtering and search
- User authentication (NextAuth v5)
- AI analysis engine (TypeScript, OpenAI/Anthropic)
- Article generation from analysis results
- Web scraping pipeline (cheerio-based)
- Background job processing (Inngest)
- LLM provider abstraction (OpenAI/Anthropic)
- Confidence scoring system
- Strategic theme identification
- **Dual-agent analysis system** (two distinct AI personas: Analyst and Gossip Girl)
- **Agent abstraction layer** (persona configs, prompt builders, cross-referencing)
- **Extended scrapers** (blog, social media, job postings)
- **Hypothesis-driven collection system** (LLM-generated investigative questions guide targeted signal collection)
- **Cross-signal debate engine** (dual agents debate accumulated evidence across multiple signals to refine inferences)
- **Correlation engine with dual-agent awareness** (connects themes across signals, tracks momentum, generates strategic inferences)
- **25 scrapers total** (core 7 + extended 7 + government 6 + new 5) + 2 trackers (AppStore, Domain)
- **NLP layer** (local Transformers.js embeddings, entity extraction, sentiment classification, keyphrase extraction, language detection, quality gate)
- **Enrichment pipeline** (website probe, blog discovery, social discovery, ticker lookup)
- **Reddit integration** (LLM-driven subreddit discovery, tracked subreddits, engagement metrics)
- **Admin dashboard** (user management, system health, content moderation, analytics, audit logging, scraper management, job monitoring, pipeline view, intelligence overview)
- **Calibration feedback loop** (weekly prediction accuracy checking via embedding similarity)

**Aspirational (rules exist but features not implemented):**
- LangGraph agent layer for multi-step analysis

## Dual-Agent Analysis System

The Tell uses two distinct AI personas to analyze signals from different perspectives:

### Agent Personas

**The Analyst** (`ANALYST`)
- Voice: Authoritative, data-driven Bloomberg Intelligence style
- Source preferences: NEWS, FILING, TRANSCRIPT
- Temperature: 0.5 (more conservative)
- Focus: Specific numbers, dates, named sources, actionable intelligence

**The Gossip Girl** (`GOSSIP_GIRL`)
- Voice: Sharp-witted Page Six meets Wall Street Journal
- Source preferences: SOCIAL, BLOG, JOB_POSTING
- Temperature: 0.7 (more creative)
- Focus: Subtext, executive behavior, hidden patterns, entertaining narrative

### Data Flow

```
Signal â†’ Agent Pipeline â†’ Analysis â†’ Article
  â†“         â†“              â†“          â†“
Scraped   Persona-specific  Facts,    Headline,
content   prompts with     sentiment,  summary,
          agent voice      themes,    body in
                           confidence agent voice
```

### Architecture

**Agent Abstraction Layer** (`src/lib/ai/agent/`)
- `types.ts` - AgentConfig interface, AgentAnalysis shape, Zod schemas
- `personas.ts` - Persona configurations (ANALYST_CONFIG, GOSSIP_GIRL_CONFIG)
- `prompts.ts` - Prompt builders that inject agent voice into analysis
- `pipeline.ts` - `analyzeSignalWithAgent()` runs full analysis with persona
- `article-generator.ts` - `generateArticleWithAgent()` creates articles in agent voice
- `cross-signal-debate.ts` - Dual-agent debate over accumulated evidence across signals

**Hypothesis Layer** (`src/lib/ai/hypothesis-generator.ts`)
- Generates investigative questions from signal patterns using LLM
- Questions guide targeted collection via hypothesis-specific scrapers
- `src/lib/inngest/hypothesis.ts` - Background job for hypothesis generation

**Cross-Referencing**
- Agents can reference each other's analyses
- `crossRefAnalyses` parameter allows agents to build on each other's work
- Enables multi-perspective synthesis
- Cross-signal debate has agents argue for/against hypotheses using accumulated evidence

### Extended Scrapers

**Blog Scraper** (`src/lib/scraping/blog-scraper.ts`)
- Extracts content from company blogs and news sites
- Handles common blog platforms (WordPress, Medium, custom)

**Social Scraper** (`src/lib/scraping/social-scraper.ts`)
- Captures social media posts (Twitter/X, LinkedIn)
- Extracts metadata, engagement metrics, hashtags

**Job Posting Scraper** (`src/lib/scraping/job-scraper.ts`)
- Scrapes job boards for strategic hiring signals
- Extracts role, requirements, location, department

## Domain Terminology

| Term | Definition |
|------|-----------|
| **Signal** | A piece of public information about a company (news article, earnings call transcript, SEC filing, social media post, job posting, patent filing) |
| **Inference** | AI analysis that extracts strategic insights from signals â€” predicts corporate intent, not just summarizes content |
| **Company** | An organization being monitored for signals (public company, private startup, government agency) |
| **Signal Source** | The origin/channel where a signal was found (Reuters, SEC EDGAR, Twitter/X, company blog, job board) |
| **Confidence** | AI-assessed probability that an inference is correct (0.0-1.0) |
| **Sentiment** | Emotional tone of a signal (positive/negative/neutral) |
| **Analysis** | The process of extracting insights from a signal (fact extraction, sentiment classification, strategic implications) |
| **Article** | News-style output generated from analysis results |

## Module Map

**Last updated**: 2026-06-22

### Signal Pipeline (data flows top-to-bottom)
- **Enrichment**: `src/lib/enrichment/` (website probe, blog/social discovery, ticker lookup)
- **URL Discovery**: `src/lib/ai/url-discovery.ts` (LLM-driven search via Serper.dev)
- **Reddit Discovery**: `src/lib/reddit/subreddit-discovery.ts` (LLM-driven subreddit suggestions)
- **Ingestion**: `src/lib/scraping/registry.ts` -> 25 scrapers -> `src/lib/scraping/cache.ts`
- **NLP**: `src/lib/nlp/` (embeddings, entity extraction, sentiment, language detection, quality gate)
- **Analysis**: `src/lib/ai/agent/pipeline.ts` -> `prompts.ts` -> `personas.ts`
- **Article Gen**: `src/lib/ai/agent/article-generator.ts`
- **Hypothesis Layer**: `src/lib/ai/hypothesis-generator.ts` -> `src/lib/inngest/hypothesis.ts`
- **Correlation**: `src/lib/inngest/correlation.ts` (theme clustering, momentum, inference generation)
- **Cross-Signal Debate**: `src/lib/ai/agent/cross-signal-debate.ts`
- **Calibration**: `src/lib/inngest/calibration.ts` (weekly prediction accuracy)
- **Background**: `src/lib/inngest/functions.ts` -> `discovery.ts`, `enrichment.ts`, `company-discovery.ts`, `subreddit-discovery.ts`

### Key Entry Points
- **Public feed**: `src/app/(public)/page.tsx` -> `feed-content.tsx` -> `feed-signal-card.tsx`
- **Public signal detail**: `src/app/(public)/signals/[id]/page.tsx` -> `signal-detail-content.tsx`
- **Public article detail**: `src/app/(public)/articles/[id]/page.tsx`
- **Public inference detail**: `src/app/(public)/inferences/[id]/page.tsx` -> `inference-detail-content.tsx`
- **Dashboard**: `src/app/dashboard/layout.tsx` -> per-page components
- **Admin dashboard**: `src/app/dashboard/admin/` (users, analytics, audit, moderation, operations, intelligence)
- **API routes**: `src/app/api/v1/{signals,articles,search,inferences,themes}/route.ts`
- **Admin API**: `src/app/api/v1/admin/` (31 routes for content, moderation, pipelines, scrapers, users)
- **Timeline API**: `src/app/api/v1/companies/[id]/timeline/`
- **Correlations API**: `src/app/api/v1/signals/[id]/correlations/`
- **Company enrichment**: `src/app/api/v1/companies/[id]/enrich/`
- **Subreddit discovery**: `src/app/api/v1/companies/[id]/subreddits/`

### Data Layer
- **Schema**: `prisma/schema.prisma` (27 models: User, Account, Session, VerificationToken, Company, Signal, Analysis, AgentDebate, SignalTheme, Inference, InferenceCalibration, CrossSignalDebate, Article, WatchedCompany, ScrapeCache, AuditLog, SystemConfig, ModerationSettings, Job, PipelineRun, PipelineLog, TrackedSubreddit, SubredditDiscoveryLog, CompanyDataSource, CompanyEnrichmentLog, CompanyHypothesis, VerificationToken)
- **DB access**: Prisma client via `src/lib/db.ts`
- **Enums**: 12 enums (Role, UserStatus, SourceType [18 values], ThemeStatus, InferenceStatus, HypothesisStatus, DebateStatus, SignalStatus, Sentiment, ArticleStatus, AgentPersona, DataOrigin)

### Cross-Cutting
- **Auth**: `src/lib/auth.ts` (NextAuth v5) - used in dashboard layout, API routes
- **Edge Auth**: `src/lib/auth-edge.ts` - edge-compatible auth helper
- **Proxy/Middleware**: `src/proxy.ts` - edge auth, rate limiting, public route protection (renamed from `src/middleware.ts` for Next.js 16)
- **AI Provider**: `src/lib/ai/provider.ts` -> OpenAI/Anthropic abstraction
- **Confidence**: `src/lib/ai/confidence.ts` + `src/lib/utils/confidence.ts`
- **Rate Limiter**: `src/lib/rate-limiter.ts`
- **Audit Logger**: `src/lib/audit-logger.ts`

### Scrapers (25 total, in `src/lib/scraping/`)
- **Core** (7): `blog-scraper.ts`, `filing-scraper.ts`, `job-scraper.ts`, `news-scraper.ts`, `rss-scraper.ts`, `social-scraper.ts`, `transcript-scraper.ts`
- **Extended** (7): `academic-scraper.ts`, `github-scraper.ts`, `press-release-scraper.ts`, `reddit-financial-scraper.ts`, `wayback-scraper.ts`, `lobbying-scraper.ts`, `exec-appearance-scraper.ts`
- **Government** (6): `congress-scraper.ts`, `courtlistener-scraper.ts`, `fda-scraper.ts`, `sam-scraper.ts`, `uspto-scraper.ts`, `cert-transparency-scraper.ts`
- **New** (5): `app-store-scraper.ts`, `conference-scraper.ts`, `conference-agenda-scraper.ts`, `supplier-earning-scraper.ts`, `web-search-scraper.ts`
- **Trackers** (2): `appstore-tracker.ts`, `domain-tracker.ts`

### NLP Layer (`src/lib/nlp/`)
- `embedding-generator.ts`, `embedding-store.ts`, `entity-extractor.ts`, `fallbacks.ts`, `index.ts`, `keyphrase-extractor.ts`, `language-detector.ts`, `model-cache.ts`, `quality-gate.ts`, `sentiment-classifier.ts`
- Uses Transformers.js for local inference (no external API needed)
- Provides embeddings, entity extraction, sentiment classification, keyphrase extraction, language detection, quality scoring

### Enrichment Pipeline (`src/lib/enrichment/`)
- `website-probe.ts` - Probe company websites for feeds/links
- `blog-discovery.ts` - Discover company blogs
- `social-discovery.ts` - Discover social media accounts
- `ticker-lookup.ts` - SEC ticker lookup
- `types.ts`, `index.ts`

### Reddit Integration (`src/lib/reddit/`)
- `subreddit-discovery.ts` - LLM-driven subreddit discovery per company

### Background Jobs (`src/lib/inngest/`)
- `functions.ts` - Main job definitions
- `discovery.ts` - Scheduled signal discovery (13 steps: RSS, filings, GitHub, cert transparency, Reddit, press releases, USPTO, CourtListener, FDA, SAM.gov, Wayback, Congress, academic)
- `correlation.ts` - Cross-signal correlation engine (theme clustering, momentum tracking, inference generation)
- `calibration.ts` - Weekly prediction accuracy checking
- `hypothesis.ts` - Hypothesis generation jobs
- `enrichment.ts` - Company enrichment jobs
- `company-discovery.ts` - Company data source discovery
- `subreddit-discovery.ts` - Reddit subreddit discovery jobs
- `client.ts` - Inngest client configuration

---

## Windows Operating System

This workspace runs on Windows. All agents must:

1. **Check OS context**: The system provides `win32` in user info indicating Windows
2. **Use PowerShell commands**: See `powershell-commands-windows.mdc` for command mappings
3. **Avoid `&&` chains**: PowerShell 5.1 (default) does not support `&&`. Use separate commands or upgrade to PowerShell 7+
4. **Use cross-platform tools**: `pnpm`, `git`, `docker` work identically on Windows

## Agent Configuration

The `.cursor/` directory contains 34 rules and 16 skills that guide agent behavior. Rules use three activation modes:

### Rule Activation Modes

1. **Always-applied** (`alwaysApply: true`): Load on every turn. Keep concise to avoid context bloat.
2. **Glob-scoped** (`globs: src/**/*.ts`): Load only when matching files are open. Reduces context usage.
3. **Agent-requestable** (`alwaysApply: false`): Load on-demand when relevant. No automatic activation.

### Rules (`.cursor/rules/`)

**Always-applied rules** (12):
- `general.mdc` - Core principles, priority hierarchy, tool priority, pnpm mandate
- `agent-persona.mdc` - Dual-mode persona (PM/UX for planning, engineer for coding)
- `auto-update-features-doc.mdc` - Auto-update docs/features-built.md after feature changes
- `design-assets-enforcement.mdc` - shadcn/ui enforcement, token system, accessibility
- `powershell-commands-windows.mdc` - Windows PowerShell command conventions
- `product-context.mdc` - Points to canonical product docs (DESIGN_SYSTEM.md, docs/research/)
- `api-design.mdc` - Next.js Route Handler conventions and REST patterns
- `code-style.mdc` - TypeScript (ESLint, Prettier) conventions
- `environment.mdc` - .env structure, Docker Compose
- `git-workflow.mdc` - Branch naming, conventional commits, PR requirements
- `security.mdc` - API keys, rate limiting, input validation, HTTPS
- `testing.mdc` - Coverage requirements, Vitest patterns, mocking strategies

**Glob-scoped rules** (9):
- `data-layer.mdc` - Prisma ORM conventions (activates when src/lib/db/ exists)
- `debuggability.mdc` - Pino logging, no console.* (activates when src/lib/ or src/app/api/ files open)
- `langgraph-patterns.mdc` - LangGraph agent coding patterns (activates when src/lib/agent/ files open)
- `layout-and-page-patterns.mdc` - Next.js dashboard page/layout patterns (activates when src/app/**/*.tsx open)
- `nextjs-patterns.mdc` - Next.js 16 app directory patterns (activates when src/app/ files open)
- `lucide-icons.mdc` - Lucide React icon usage rules (activates when src/**/*.tsx or src/**/*.ts open)
- `react-components.mdc` - React component patterns for App Router (activates when src/**/*.tsx or src/**/*.ts open)
- `testing-conventions.mdc` - Vitest + Playwright testing conventions (activates when test files open)
- `typescript-standards.mdc` - TypeScript coding standards (activates when src/**/*.ts or src/**/*.tsx open)

**Agent-requestable rules** (11):
- `agentic-reasoning-guardrails.mdc` - 11 rules preventing tool loops, phantom calls, context bloat
- `continuous-improvement.mdc` - Mistake capture loop, lessons-learned tracking
- `langgraph-reference.mdc` - Extended LangGraph reference (aspirational for agent layer)
- `nextjs-auth.mdc` - auth() helper, SessionProvider, proxy.ts patterns (aspirational for auth)
- `plan-execution.mdc` - Execution checkpoints, direct vs subagent, verification
- `plan-mode-enhancement.mdc` - Plan validation checklist, mandatory template
- `strreplace-safety.mdc` - Large JSX/markdown StrReplace safety patterns
- `subagent-orchestration.mdc` - Multi-agent patterns, circuit breakers, decomposition
- `web-search-optimization.mdc` - Query construction, site-specific search, result evaluation
- `write-effective-rules.mdc` - How to write .mdc rules (meta-rule)
- `write-effective-skills.mdc` - How to author SKILL.md files (meta-rule)

### Skills (`.cursor/skills/`)

**Domain skills** (12):
- `adding-signal-source/` - Add new signal source types to the pipeline
- `api-design/` - Next.js Route Handler patterns, request/response schemas, versioning
- `article-generation/` - Transform analysis into news-style articles
- `data-modeling/` - TypeScript types, Zod schemas, layered validation
- `langgraph-orchestration/` - LangGraph.js workflows, state machines, cross-signal inference
- `llm-abstraction/` - Provider-agnostic LLM interface (OpenAI/Anthropic)
- `monorepo-deployment/` - Next.js deployment patterns
- `opencode-sdk/` - OpenCode SDK integration, custom agents/tools, automation
- `pydanticai-agents/` - PydanticAI structured outputs and multi-provider LLM
- `signal-analysis/` - Extract insights from raw public signals
- `testing-strategies/` - Test non-deterministic systems (LLM, scraping)
- `web-scraping/` - Polite scraping with caching, rate limiting, retry logic

**Reference skills** (4):
- `browser-testing-workflows/` - Authenticated SPA testing with Chrome DevTools MCP or Playwright
- `docker-workflows/` - Docker architecture for CloakBrowser + Postgres (aspirational)
- `svg-design/` - SVG creation/editing with 9 reference files (accessibility, animation, icon design, logo techniques, optimization, path patterns, editing workflows)
- `use-chrome-devtools-mcp/` - Chrome DevTools Protocol automation guide

### Configuration Files

- `.cursor/settings.json` - Cursor settings (Vercel plugin enabled)
- `.cursor/lessons-learned.md` - Tracks mistakes and lessons learned (updated by continuous-improvement rule)
- `docs/features-built.md` - Tracks all features built (updated by auto-update-features-doc rule)

**Before writing code:** Check the relevant rule for conventions and skill for techniques.
