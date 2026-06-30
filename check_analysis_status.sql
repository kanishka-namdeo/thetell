-- Check analysis status
SELECT 
  s.id,
  s.title,
  s.status,
  COUNT(a.id) as analysis_count
FROM "Signal" s
LEFT JOIN "Analysis" a ON s.id = a."signalId"
WHERE s.id LIKE 'test-signal-%'
GROUP BY s.id, s.title, s.status
ORDER BY s.id;

-- Check for any recent analyses
SELECT 
  id,
  "signalId",
  "agentPersona",
  confidence,
  "analyzedAt"
FROM "Analysis"
ORDER BY "analyzedAt" DESC
LIMIT 10;
