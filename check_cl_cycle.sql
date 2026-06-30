-- Check CourtListener runs after 09:25 (after the fix was deployed)
SELECT 'CL recent runs' as query, id, "companyId", status, "signalsCreated", "duplicatesSkipped", error, "startedAt", "completedAt" FROM "PipelineRun" WHERE "scraperName" = 'courtlistener' AND "startedAt" > '2026-06-29 09:25:00' ORDER BY "startedAt" DESC LIMIT 10;

-- Check all scrapers that ran in the latest discovery cycle (after 09:25)
SELECT 'Latest cycle scrapers' as query, "scraperName", status, "signalsCreated", "startedAt" FROM "PipelineRun" WHERE "startedAt" > '2026-06-29 09:25:00' ORDER BY "startedAt" DESC LIMIT 30;
