SELECT status, COUNT(*) as count FROM "Signal" GROUP BY status ORDER BY count DESC;
SELECT COUNT(*) as total FROM "Signal";
