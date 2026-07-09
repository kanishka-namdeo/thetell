# Control Center

**Location**: `src/app/dashboard/admin/control-center/page.tsx`
**Access**: Admin-only (`/dashboard/admin/control-center`)

The Control Center is the single place for admins to monitor and manually trigger the signal processing pipeline. It replaces trigger buttons that were previously scattered across Content, Sources, Scrapers, Subreddits, and Pipelines pages.

## Pipeline Stages

The page displays 5 stages in pipeline order. Each stage shows a status indicator, key metrics, and a manual trigger button.

```
Sources → Enrichment → Discovery → Analysis → Correlation
```

### Stage 1: Sources

**What it does**: Validates that company data sources (RSS feeds, websites, APIs) are reachable and returning valid content.

**Trigger**: "Run Health Check" — sends `source/health.check` event to Inngest, which iterates over all `CompanyDataSource` records and probes each for availability.

**Metrics**: Total sources, healthy sources, failed sources (3+ consecutive failures).

**Automated schedule**: No cron — health checks run as part of the daily discovery pipeline. Use the manual trigger when sources are suspected to be failing or after adding new sources.

### Stage 2: Enrichment

**What it does**: Probes company websites to discover blogs, social media accounts, RSS feeds, and ticker symbols. Stores results in `CompanyEnrichmentLog`.

**Trigger**: "Re-enrich Company" — prompts for company selection, then sends `company/enrichment.requested` event. Runs website probe, blog discovery, social discovery, and ticker lookup for the selected company.

**Metrics**: Companies enriched, pending enrichment.

**Automated schedule**: Runs automatically during signal discovery for companies that haven't been enriched yet. Use the manual trigger to re-enrich a specific company after its website has changed.

### Stage 3: Discovery

**What it does**: Runs the full signal discovery pipeline across all enabled scrapers for selected companies. This is the primary data collection stage — scrapes RSS feeds, SEC filings, social media, job postings, government databases, etc.

**Trigger**: "Run Discovery" — sends `signal/discovery.requested` event. Can target all companies or a specific subset.

**Metrics**: Signals discovered in last 24h, signals pending processing.

**Automated schedule**: Daily cron at 2:00 AM UTC (`src/lib/inngest/discovery.ts`). Use the manual trigger after adding a new company, enabling a new scraper, or when you need fresh data outside the cron window.

### Stage 4: Analysis

**What it does**: Runs AI analysis on pending signals. Each signal is analyzed by both agent personas (Analyst and Gossip Girl) to extract facts, sentiment, and themes.

**Trigger**: "Re-analyze Signals" — sends `signal/analysis.requested` event. Can target all pending signals or filter by company/source type.

**Metrics**: Signals analyzed, signals pending analysis, average confidence score.

**Automated schedule**: Analysis runs automatically after each discovery run processes new signals. Use the manual trigger when signals are stuck in PENDING status, or after changing AI models/prompts and wanting to re-process existing signals.

### Stage 5: Correlation

**What it does**: Cross-signal analysis that clusters themes by embedding similarity, detects convergence across source types, and tracks theme momentum.

**Trigger**: "Run Correlation" — sends `correlation/manual.trigger` event.

**Metrics**: Themes detected, signals clustered.

**Automated schedule**: No dedicated cron — correlation runs as part of the post-analysis pipeline. Use the manual trigger after a large batch of new analyses to update theme clusters.

## Troubleshooting

### Stage shows "idle" but should have run recently

Check the Jobs tab (`/dashboard/admin/operations/jobs`) for failed Inngest runs. Common causes:
- **LLM API errors**: Check API key validity and rate limits in `.env.local`
- **Scraper failures**: Individual scrapers may be failing due to site changes — check logs in Pipeline View
- **Database connection**: Verify Docker is running (`docker-compose up -d db`)

### Trigger button returns an error

- **401 Unauthorized**: Your session may have expired. Refresh the page and sign in again.
- **500 Internal Error**: Check the application logs. The trigger may have been accepted but the Inngest event failed to send. Verify Inngest is running.

### Signals stuck in PENDING status

1. Go to Control Center → Analysis stage
2. Click "Re-analyze Signals"
3. If the count doesn't decrease after a few minutes, check:
   - Inngest job queue for stuck/failed jobs
   - LLM provider availability (check API key and rate limits)
   - Application logs for analysis pipeline errors

### Discovery found 0 new signals

This is normal if no new content has been published since the last run. To verify scrapers are working:
1. Go to Sources stage → "Run Health Check"
2. Check that healthy sources > 0
3. If all sources are failing, the issue is likely network-related or the source sites have changed

### Correlation not detecting themes

If correlation is not detecting themes, check:
- Whether recent analyses completed successfully
- Whether signals have extracted themes (check signal detail pages)
- LLM provider availability and API key status

## Related Pages

| Page | Purpose |
|------|---------|
| Content (`/dashboard/admin/content`) | Moderate and manage published content (now monitoring-only) |
| System (`/dashboard/admin/operations`) | System health, job monitoring, scraper status |
| Pipeline View (`/dashboard/admin/pipelines`) | Per-company pipeline status and scraper grid |
| Intelligence (`/dashboard/admin/intelligence`) | Themes generated by correlation |
