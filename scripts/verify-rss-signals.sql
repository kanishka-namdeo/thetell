-- Verify RSS live test signals in DB
\echo '=== RSS SIGNALS SUMMARY ==='
SELECT COUNT(*) as rss_signals FROM "Signal" WHERE "scraperName" = 'rss-scraper' AND "feedLabel" IS NOT NULL;

\echo ''
\echo '=== SIGNALS BY FEED ==='
SELECT "feedLabel", COUNT(*) as count FROM "Signal" WHERE "scraperName" = 'rss-scraper' AND "feedLabel" IS NOT NULL GROUP BY "feedLabel" ORDER BY count DESC;

\echo ''
\echo '=== RECENT RSS SIGNALS ==='
SELECT id, "feedLabel", LEFT(title, 60) as title, LENGTH("rawContent") as content_len, "publishedAt" FROM "Signal" WHERE "scraperName" = 'rss-scraper' AND "feedLabel" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 10;

\echo ''
\echo '=== TOTAL SIGNAL COUNT ==='
SELECT COUNT(*) as total_signals FROM "Signal";
