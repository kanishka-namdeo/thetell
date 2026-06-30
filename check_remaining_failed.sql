-- Check the 10 remaining failed signals
SELECT id, LEFT(title, 80) as title, "updatedAt"
FROM "Signal" 
WHERE status = 'FAILED' 
ORDER BY "updatedAt" DESC;
