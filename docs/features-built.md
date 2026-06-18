# Features Built

**Last updated**: 2026-06-18

This document tracks all features built in The Tell application. Updated automatically after each feature implementation session.

**Format**: Each feature includes a Purpose column explaining WHY it exists (user value/problem solved), not just WHAT it is.

---

## Pages & Routes

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| Public Feed (Home) | Casual browsing of latest AI-analyzed signals without login — the core discovery surface | Live server-rendered feed with hero inference (with persona badge), signal cards, trending themes, recent articles, soft signup CTA, cursor-based pagination with Load More | `src/app/(public)/page.tsx` | ✅ Built |
| Public Signal Detail | Let anyone read full AI analysis of a signal without auth — builds trust in inference quality | Read-only signal page with content, confidence bands, sentiment, key facts, strategic themes, consensus badge, share button, signup prompt | `src/app/(public)/signals/[id]/page.tsx` | ✅ Built |
| Public Article Detail | Let anyone read generated articles without auth — enables sharing and virality | Read-only article page with safe markdown rendering, company info, published date, agent persona badge, source signal link, share button, signup prompt | `src/app/(public)/articles/[id]/page.tsx` | ✅ Built |
| Public Layout | Lightweight newspaper-style chrome for public pages — no dashboard complexity | Header with branding/date, Feed + Sign In nav, public search bar, minimal footer | `src/app/(public)/layout.tsx` | ✅ Built |
| Signup Prompt | Soft conversion from casual browsing to registered user — non-intrusive CTA | Inline card prompting account creation, placed between feed sections and at bottom of detail pages | `src/app/(public)/_components/signup-prompt.tsx` | ✅ Built |
| Feed Signal Card | Compact signal display for the public feed — scannable at a glance | Card with title, company, source type, confidence badge, sentiment indicator, date | `src/app/(public)/_components/feed-signal-card.tsx` | ✅ Built |
| Trending Themes | Show aggregate strategic themes from high-confidence analyses — quick pattern recognition | Sidebar widget extracting top strategic themes from analyses with confidence >= 0.7, grouped by frequency | `src/app/(public)/_components/trending-themes.tsx` | ✅ Built |
| Home Page (Legacy) | Original static marketing landing page | Replaced by Public Feed; original file deleted | `src/app/page.tsx` | ❌ Removed |
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
| Loading States | Provide visual feedback during data fetching — improves perceived performance | Skeleton screens for all public pages (feed, signal detail, article detail) using shadcn Skeleton | `src/app/(public)/loading.tsx`, `src/app/(public)/signals/[id]/loading.tsx`, `src/app/(public)/articles/[id]/loading.tsx` | ✅ Built |
| Error Boundaries (Public) | Graceful error handling on public pages with retry | error.tsx files for feed, signal detail, article detail with retry button | `src/app/(public)/error.tsx`, `src/app/(public)/signals/[id]/error.tsx`, `src/app/(public)/articles/[id]/error.tsx` | ✅ Built |
| Consensus Badge | Show agreement level between dual agents — builds trust in multi-agent analysis | Displays "Strong Agreement", "Mixed Signals", or "Divergent Views" based on sentiment and theme alignment | `src/app/(public)/signals/[id]/consensus-badge.tsx` | ✅ Built |
| Confidence Band | Progressive disclosure of confidence — more intuitive than raw percentages | Maps confidence to bands: "High Confidence" (0.8+), "Likely" (0.6-0.8), "Uncertain" (<0.6) with tooltips | `src/components/dashboard/confidence-band.tsx` | ✅ Built |
| Agent Info Card | Transparency about agent methodology — helps users understand dual-agent system | Expandable cards explaining The Analyst and Gossip Girl personas, voice, source preferences | `src/app/(public)/_components/agent-info-card.tsx` | ✅ Built |
| Share Button | Enable content sharing — supports virality and professional workflows | Clipboard copy with "Copied!" feedback, placed on signal and article detail pages | `src/components/dashboard/share-button.tsx` | ✅ Built |
| Public Search | Discover content across public pages — critical navigation feature | Debounced search across signals, companies, articles with dropdown results | `src/app/(public)/_components/public-search.tsx` | ✅ Built |
| Pagination | Navigate large signal collections — prevents information overload | Cursor-based pagination with "Load More" button on public feed | `src/app/(public)/page.tsx` | ✅ Built |
| URL-Persisted Agent Filter | Preserve filter state across page loads — supports sharing and bookmarking | Agent filter state synced to URL query params (?agent=ANALYST) | `src/app/(public)/_components/feed-content.tsx` | ✅ Built |

## Backend Features

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| Python Backend | Original FastAPI implementation | Python 3.13 FastAPI backend with SQLAlchemy ORM | `backend/` | ❌ Removed |
| LLM Provider Abstraction | Unified interface for multiple AI providers | Provider-agnostic LLM interface supporting OpenAI and Anthropic | `src/lib/ai/provider.ts` | ✅ Built |
| Analysis Pipeline | Extract insights from raw signals | Multi-stage AI analysis pipeline with fact extraction, sentiment analysis, and theme detection | `src/lib/ai/pipeline.ts` | ✅ Built |
| Article Generator | Transform analysis into news-style articles | AI-powered article generation from structured analysis results | `src/lib/ai/article-generator.ts` | ✅ Built |
| Web Scraping Pipeline | Collect public company signals | Polite web scraping with caching, rate limiting, and retry logic | `src/lib/scraping/` | ✅ Built |
| Background Job Processing | Async task execution | Inngest-based background job processing for AI analysis tasks | `src/lib/inngest/` | ✅ Built |
| Search API | Enable cross-entity search across signals, companies, articles | GET endpoint with query param `q`, case-insensitive search, returns grouped results (5 per type) | `src/app/api/v1/search/route.ts` | ✅ Built |
| Database Schema | Persistent storage for all entities with relational integrity | Prisma schema with 7 models (User, Account, Session, Company, Signal, Analysis, Article, WatchedCompany), migrations, seed data | `prisma/schema.prisma` | ✅ Built |
| NextAuth v5 Integration | Secure session-based authentication for frontend users | NextAuth v5 with credentials provider, session management, protected routes | `src/lib/auth.ts` | ✅ Built |
| Dual-Agent Analysis System | Provides two distinct analytical voices (The Analyst and Gossip Girl) to give users multiple perspectives on corporate signals | Two AI agents with distinct personas analyze the same signals independently, producing articles in different tones. Agents can cross-reference each other's work. | `src/lib/ai/agent/` | ✅ Built |
| RSS/Atom Feed Aggregator | Passive signal ingestion from company newsrooms and blogs — enables automated discovery without manual URL submission | Parses RSS 2.0 and Atom feeds with cheerio, extracts items with structured data, feed registry mapping companies to feed URLs | `src/lib/scraping/rss-scraper.ts`, `src/lib/scraping/feed-registry.ts` | ✅ Built |
| SEC EDGAR Integration | Makes FILING source type functional for investment analysts — the most valuable signal type had no real parser | FilingScraper queries SEC's free public API by CIK or company name, extracts filing metadata (type, date, URL), parses HTML/SGML/XBRL content | `src/lib/scraping/filing-scraper.ts` | ✅ Built |
| Transcript Scraper | Makes TRANSCRIPT source type functional — earnings calls and Fed speeches reveal strategic intent | Specialized parser for SEC EDGAR 8-K filings, Federal Reserve/FOMC transcripts, and company IR pages; extracts speakers, roles, Q&A sections | `src/lib/scraping/transcript-scraper.ts` | ✅ Built |
| Content Deduplication | Prevents duplicate LLM spend on already-analyzed signals — saves money directly | SHA-256 content hash on Signal model, URL normalization (strips utm_*, fbclid, etc.), returns existing signal if duplicate detected | `src/lib/scraping/url-normalizer.ts`, `prisma/schema.prisma` | ✅ Built |
| Persistent Scrape Cache | Survives server restarts — eliminates redundant re-scraping and bandwidth waste | PostgreSQL-backed ScrapeCache table replacing in-memory TTLCache, 24-hour default TTL, graceful degradation on DB errors | `src/lib/scraping/cache.ts`, `prisma/schema.prisma` | ✅ Built |
| Scheduled Discovery | Transforms system from manual tool to automated monitoring platform — core product requirement | Inngest cron function (daily 2:00 AM UTC) scans RSS feeds and SEC EDGAR for tracked companies, auto-creates signals and triggers analysis | `src/lib/inngest/discovery.ts` | ✅ Built |
| Social Scraper Resilience | Reduces fragility of social signal collection — Nitter instances frequently die | Added Hacker News API (free, no auth), Mastodon public API, dynamic Nitter instance health checks, Twitter/X embed fallback | `src/lib/scraping/social-scraper.ts` | ✅ Built |
| Scraper Registry | Centralizes scraper management and configuration — enables runtime enablement/disablement | Registry pattern exporting all 18 scrapers with configuration, API key requirements, and enablement status. Auto-disables scrapers when required API keys are missing | `src/lib/scraping/registry.ts` | ✅ Built |
| Extended Discovery System | Expands automated signal collection beyond RSS/filings to 11 additional sources — dramatically increases signal coverage | Inngest cron function now runs 13 scraping steps: RSS feeds, SEC filings, GitHub activity, certificate transparency, Reddit financial, press release wires, USPTO patents, CourtListener litigation, FDA drug/device, SAM.gov contracts, Wayback Machine, Congress.gov legislation, academic papers. Each step creates Signal records with deduplication and triggers analysis pipeline | `src/lib/inngest/discovery.ts` | ✅ Built |
| New Source Types | Enables storage of signals from government, legal, scientific, and technical sources — unlocks new signal categories | Added 11 SourceType enum values: PATENT, LITIGATION, FDA, CONTRACT, TECH_SIGNAL, WEB_ARCHIVE, LEGISLATION, ACADEMIC, PODCAST, CONFERENCE, PRESS_RELEASE. Updated Prisma schema, AI types, and confidence scoring weights | `prisma/schema.prisma`, `src/lib/ai/types.ts`, `src/lib/ai/confidence.ts` | ✅ Built |

## Infrastructure

| Feature | Purpose | Description | Location | Status |
|---------|---------|-------------|----------|--------|
| Docker PostgreSQL | Local development database with persistence | PostgreSQL 16 container on port 5433, thell_user/thetell_password, pgdata volume | `docker-compose.yml` | ✅ Built |
| Environment Configuration | Manage secrets and config across environments | .env files for frontend, Docker Compose env vars | `.env`, `.env.local` | ✅ Built |
| Prisma Migrations | Version-controlled database schema changes | Initial migration with all tables, seed script for demo data | `prisma/migrations/` | ✅ Built |

## Planned Features (Not Yet Built)

These features are planned to deliver the core product vision. Each includes the strategic rationale.

| Feature | Purpose | Description | Status |
|---------|---------|-------------|--------|
| Inference Engine | Connect signals across types to predict corporate intent — the core differentiator | Cross-signal pattern detection, confidence scoring, strategic theme clustering | 🚧 Not Started |
| Alert System | Notify users when high-confidence inferences are detected for tracked companies | Email/in-app notifications, confidence thresholds, company watchlists | 🚧 Not Started |
