-- Check CourtListener pipeline runs
SELECT 'CL runs' as q, id, "companyId", status, "signalsCreated", "duplicatesSkipped", error, "startedAt", "completedAt" FROM "PipelineRun" WHERE "scraperName" = 'courtlistener' ORDER BY "startedAt" DESC LIMIT 10;

-- Check signal counts
SELECT 'Signal types' as q, "sourceType", COUNT(*) as count FROM "Signal" GROUP BY "sourceType" ORDER BY count DESC;

-- Check latest pipeline runs across all scrapers
SELECT 'Latest runs' as q, "scraperName", status, "signalsCreated", "startedAt" FROM "PipelineRun" ORDER BY "startedAt" DESC LIMIT 20;

-- Check LITIGATION signals
SELECT 'LITIGATION signals' as q, COUNT(*) as count FROM "Signal" WHERE "sourceType" = 'LITIGATION';
