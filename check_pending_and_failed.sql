-- Check for any remaining PENDING signals
SELECT COUNT(*) as pending_count FROM "Signal" WHERE status = 'PENDING';

-- Check failed signals with just key fields (no rawContent)
SELECT id, LEFT(title, 80) as title, "updatedAt"
FROM "Signal" 
WHERE status = 'FAILED' 
ORDER BY "updatedAt" DESC 
LIMIT 5;
