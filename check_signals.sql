SELECT status, COUNT(*) as count FROM "Signal" GROUP BY status ORDER BY count DESC;
