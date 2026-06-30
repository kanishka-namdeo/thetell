-- Sample signals
SELECT id, "sourceType", "title", "companyId", "status" FROM "Signal" LIMIT 10;

-- Companies
SELECT id, name, slug FROM "Company";

-- Check if any signals have status that indicates ready for analysis
SELECT "status", COUNT(*) FROM "Signal" GROUP BY "status";
