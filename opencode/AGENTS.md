# The Tell - Debug Agent Context

You are debugging **The Tell**, an AI-powered corporate intelligence platform built with Next.js 16.

## Architecture Overview

**Stack:**
- Next.js 16.2.9 (App Router)
- TypeScript
- Prisma ORM (PostgreSQL)
- OpenAI-compatible LLM (via custom provider at BASE_URL)
- Inngest for background jobs
- Docker Compose for local services

## Key Directories

```
src/
├── app/                    # Next.js routes
│   ├── (dashboard)/       # Protected dashboard pages
│   ├── api/v1/            # API routes
│   └── (public)/          # Public pages (no auth)
├── lib/
│   ├── ai/                # LLM integration
│   │   ├── provider.ts    # OpenAI-compatible provider
│   │   └── agent/         # Dual-agent system (Analyst + Gossip Girl)
│   ├── scraping/          # 22 web scrapers
│   │   ├── registry.ts    # Scraper registry
│   │   ├── cache.ts       # Response caching
│   │   └── [name]-scraper.ts
│   ├── inngest/           # Background job functions
│   └── db.ts              # Prisma client
└── components/            # React components

prisma/
└── schema.prisma          # Database schema

docker-compose.yml         # Local services (Postgres, Inngest, OpenCode)
```

## Signal Pipeline (Data Flow)

```
1. URL Discovery (src/lib/ai/url-discovery.ts)
   ↓
2. Scraping (src/lib/scraping/registry.ts → 22 scrapers)
   ↓
3. Caching (src/lib/scraping/cache.ts)
   ↓
4. Analysis (src/lib/ai/agent/pipeline.ts)
   ↓
5. Article Generation (src/lib/ai/agent/article-generator.ts)
```

## Common Debug Scenarios

### "Company X has no signals"
Check:
1. Does company exist in DB? Query: `prisma.company.findUnique({ where: { id: "..." } })`
2. Does company have `CompanyDataSource` records? (RSS feeds, social accounts)
3. Check `src/lib/scraping/feed-registry.ts` — hardcoded feeds use string IDs like "amd", not UUIDs
4. Check if discovery was triggered: Look for `company/discovery.requested` Inngest event
5. Check individual scrapers: Do they return results for this company's feeds?

### "Scraper X is failing"
Check:
1. Scraper implementation in `src/lib/scraping/[name]-scraper.ts`
2. Rate limiting in `src/lib/scraping/cache.ts`
3. HTTP errors — check if site is blocking requests
4. Parse errors — check if HTML structure changed

### "Analysis is slow/wrong"
Check:
1. LLM provider config in `src/lib/ai/provider.ts`
2. Model being used (FAST_MODEL vs REASONING_MODEL env vars)
3. Prompt construction in `src/lib/ai/agent/prompts.ts`
4. Dual-agent system: Analyst vs Gossip Girl personas

### "Background jobs not running"
Check:
1. Inngest dev server running? (docker-compose service)
2. Check `src/lib/inngest/functions.ts` for job definitions
3. Check Inngest dashboard at http://localhost:8288

## Database Access

Use the Prisma MCP server to query the database:
- Company: `prisma.company`
- Signal: `prisma.signal`
- Analysis: `prisma.analysis`
- Article: `prisma.article`
- CompanyDataSource: `prisma.companyDataSource` (feeds/social accounts)

## Environment Variables

Key vars (see `.env.local`):
- `API_KEY` — OpenAI-compatible API key
- `BASE_URL` — LLM endpoint (https://irhnglwoxe.a.pinggy.link/v1)
- `FAST_MODEL` — qwen3-coder-next
- `REASONING_MODEL` — qwen3.6-plus
- `DATABASE_URL` — PostgreSQL connection
- `BRAVE_API_KEY` — Web search for URL discovery

## Debugging Workflow

1. **Understand the problem** — What's the expected behavior vs actual?
2. **Check the database** — Use Prisma MCP to inspect records
3. **Trace the pipeline** — Where does data flow break?
4. **Check logs** — Look at Inngest dashboard, Next.js console
5. **Test scrapers** — Run individual scrapers in isolation
6. **Verify LLM calls** — Check prompts, responses, token usage

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

## Important Notes

- This is a **local development environment** — all data is local
- The app runs at http://localhost:3000
- Inngest dashboard at http://localhost:8288
- Database is PostgreSQL in Docker (port 5433)
- Use `pnpm` for package management (not npm/yarn)
- Follow existing code patterns — check similar implementations before writing new code
