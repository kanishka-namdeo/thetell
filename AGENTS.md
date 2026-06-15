<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The Tell - Project Structure

**The Tell** is an AI system that reads public company signals and infers inner workings. It's a monorepo with a Python 3.13 FastAPI backend and Next.js 16.2.9 frontend.

## Current State (as of 2026-06-15)

**Built:**
- Design system (newsprint aesthetic, shadcn/ui components, typography, layout)
- Landing page with hero section
- Component library (UI primitives, layout, typography, icons)
- Project structure and configuration

**Not Built:**
- Backend API (FastAPI)
- Database layer (Prisma schema, models, migrations)
- Scraping pipeline
- AI analysis engine
- Signal dashboard
- User authentication

**Aspirational (rules exist but features not implemented):**
- LangGraph agent layer for multi-step analysis
- Article generation from analysis results
- Signal ingestion from multiple sources (news, filings, transcripts, social)
- Confidence scoring system
- Cross-signal inference engine
- User authentication and session management

## Domain Terminology

| Term | Definition |
|------|-----------|
| **Signal** | A piece of public information about a company (news article, earnings call transcript, SEC filing, social media post, job posting, patent filing) |
| **Inference** | AI analysis that extracts strategic insights from signals — predicts corporate intent, not just summarizes content |
| **Company** | An organization being monitored for signals (public company, private startup, government agency) |
| **Signal Source** | The origin/channel where a signal was found (Reuters, SEC EDGAR, Twitter/X, company blog, job board) |
| **Confidence** | AI-assessed probability that an inference is correct (0.0-1.0) |
| **Sentiment** | Emotional tone of a signal (positive/negative/neutral) |
| **Analysis** | The process of extracting insights from a signal (fact extraction, sentiment classification, strategic implications) |
| **Article** | News-style output generated from analysis results |

## Windows Operating System

This workspace runs on Windows. All agents must:

1. **Check OS context**: The system provides `win32` in user info indicating Windows
2. **Use PowerShell commands**: See `powershell-commands-windows.mdc` for command mappings
3. **Use venv Python**: Use `.venv\Scripts\python.exe` for all Python commands per `python-venv.mdc`
4. **Avoid `&&` chains**: PowerShell 5.1 (default) does not support `&&`. Use separate commands or upgrade to PowerShell 7+
5. **Use cross-platform tools**: `pnpm`, `git`, `docker` work identically on Windows

**Cross-platform enforcement**: See `cross-platform-enforcement.mdc` for shell command guidelines.

## Agent Configuration

The `.cursor/` directory contains 26 rules and 12 skills that guide agent behavior. Rules use three activation modes:

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
- `api-design.mdc` - REST conventions, Pydantic schemas, pagination, error format
- `code-style.mdc` - Python (Black, Ruff, mypy) + TypeScript (ESLint, Prettier) conventions
- `environment.mdc` - .env structure, Pydantic Settings, Docker Compose
- `git-workflow.mdc` - Branch naming, conventional commits, PR requirements
- `security.mdc` - API keys, rate limiting, input validation, HTTPS
- `testing.mdc` - Coverage requirements, pytest/Vitest patterns, mocking strategies

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

**Domain skills** (8):
- `api-design/` - FastAPI REST patterns, schemas, versioning
- `article-generation/` - Transform analysis into news-style articles
- `data-modeling/` - Pydantic models + TypeScript types, layered validation
- `llm-abstraction/` - Provider-agnostic LLM interface (OpenAI/Anthropic)
- `monorepo-deployment/` - FastAPI + Next.js deployment patterns
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
