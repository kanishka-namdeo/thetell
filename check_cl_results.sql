-- Check if CourtListener is now producing signals
SELECT 'LITIGATION signals' as query, COUNT(*) as count FROM "Signal" WHERE "sourceType" = 'LITIGATION';

-- Check recent CourtListener pipeline runs
SELECT 'Recent CL runs' as query, id, "companyId", status, "signalsCreated", "duplicatesSkipped", error, "startedAt", "completedAt" FROM "PipelineRun" WHERE "scraperName" = 'courtlistener' ORDER BY "startedAt" DESC LIMIT 5;

-- Check all signal types
SELECT 'Signal types' as query, "sourceType", COUNT(*) as count FROM "Signal" GROUP BY "sourceType" ORDER BY count DESC;

-- Check if there are any errors in recent CL runs
SELECT 'CL errors' as query, id, "companyId", error FROM "PipelineRun" WHERE "scraperName" = 'courtlistener' AND error IS NOT NULL ORDER BY "startedAt" DESC LIMIT 5;
