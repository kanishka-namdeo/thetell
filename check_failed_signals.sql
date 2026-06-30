SELECT id, title, status, "updatedAt" FROM "Signal" WHERE status = 'FAILED' ORDER BY "updatedAt" DESC LIMIT 10;
