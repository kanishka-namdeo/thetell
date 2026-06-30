-- Check CourtListener pipeline runs after 1:00 PM today
SELECT 'CL after 1PM' as q, id, "companyId", status, "signalsCreated", "duplicatesSkipped", error, "startedAt", "completedAt" FROM "PipelineRun" WHERE "scraperName" = 'courtlistener' AND "startedAt" > '2026-06-29 13:00:00' ORDER BY "startedAt" DESC LIMIT 10;

-- Check all pipeline runs after 1:00 PM to see which scrapers ran
SELECT 'All after 1PM' as q, "scraperName", status, "signalsCreated", "startedAt" FROM "PipelineRun" WHERE "startedAt" > '2026-06-29 13:00:00' GROUP BY "scraperName", status, "signalsCreated", "startedAt" ORDER BY "startedAt" ASC;

-- Check if there are any new LITIGATION signals
SELECT 'LITIGATION count' as q, COUNT(*) as count FROM "Signal" WHERE "sourceType" = 'LITIGATION';
