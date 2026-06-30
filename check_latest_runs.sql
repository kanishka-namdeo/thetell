-- Check latest pipeline runs across all scrapers
SELECT 'Latest runs' as query, "scraperName", status, "signalsCreated", "startedAt" FROM "PipelineRun" ORDER BY "startedAt" DESC LIMIT 15;

-- Check latest discovery job
SELECT 'Latest discovery' as query, id, "triggeredBy", "startedAt", "completedAt", status FROM "Job" WHERE name LIKE '%discovery%' ORDER BY "startedAt" DESC LIMIT 5;
