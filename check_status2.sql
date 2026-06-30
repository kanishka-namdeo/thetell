-- Check for any errors in recent pipeline runs
SELECT 'Errors' as q, "scraperName", error, "startedAt" FROM "PipelineRun" WHERE error IS NOT NULL AND error != '' ORDER BY "startedAt" DESC LIMIT 10;

-- Check if courtlistener ran in the latest cycle (after 09:25)
SELECT 'CL after 09:25' as q, id, "companyId", status, "signalsCreated", error, "startedAt" FROM "PipelineRun" WHERE "scraperName" = 'courtlistener' AND "startedAt" > '2026-06-29 09:25:00' ORDER BY "startedAt" DESC LIMIT 10;

-- Check all scrapers in the latest cycle to see which steps ran
SELECT 'All after 09:25' as q, "scraperName", status, "signalsCreated", "startedAt" FROM "PipelineRun" WHERE "startedAt" > '2026-06-29 09:25:00' GROUP BY "scraperName", status, "signalsCreated", "startedAt" ORDER BY "startedAt" ASC;
