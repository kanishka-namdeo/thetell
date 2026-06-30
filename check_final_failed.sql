-- Check the 1 remaining failed signal
SELECT id, LEFT(title, 80) as title, "updatedAt", "rawContent"
FROM "Signal" 
WHERE status = 'FAILED' 
LIMIT 1;

-- Check signals still analyzing
SELECT COUNT(*) as analyzing_count FROM "Signal" WHERE status = 'ANALYZING';
