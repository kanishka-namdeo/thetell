-- Final signal status summary
SELECT status, COUNT(*) as count FROM "Signal" GROUP BY status ORDER BY count DESC;

-- Check for any recent errors in the last 5 minutes
SELECT id, LEFT(title, 60) as title, "updatedAt"
FROM "Signal" 
WHERE status = 'FAILED' AND "updatedAt" > NOW() - INTERVAL '5 minutes'
ORDER BY "updatedAt" DESC
LIMIT 5;
