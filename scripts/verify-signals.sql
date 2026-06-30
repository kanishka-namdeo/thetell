-- Count signals by scraper
SELECT 
  "scraperName",
  COUNT(*) as count
FROM "Signal"
WHERE "scraperName" IS NOT NULL
GROUP BY "scraperName"
ORDER BY count DESC;

-- Count signals by source type
SELECT 
  "sourceType",
  COUNT(*) as count
FROM "Signal"
GROUP BY "sourceType"
ORDER BY count DESC;

-- Count signals by company
SELECT 
  c.name,
  COUNT(s.id) as signal_count
FROM "Signal" s
JOIN "Company" c ON s."companyId" = c.id
GROUP BY c.name
ORDER BY signal_count DESC
LIMIT 10;

-- Total signal count
SELECT COUNT(*) as total_signals FROM "Signal";
