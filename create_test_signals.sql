-- Create test signals for dual-agent analysis testing
INSERT INTO "Signal" (id, "sourceType", "sourceUrl", title, "rawContent", "scrapedAt", "companyId", status, "createdAt", "updatedAt")
VALUES 
('test-signal-1', 'NEWS', 'https://example.com/test1', 'Google Reports Q4 Revenue Growth', 
'Alphabet Inc. reported strong Q4 2024 results with revenue reaching $86.3 billion, up 13% year-over-year. CEO Sundar Pichai highlighted AI investments and cloud growth as key drivers. The company announced plans to increase AI infrastructure spending by $10 billion in 2025.',
NOW(), 'cmqxolxir0028ekln4sa3hx03', 'PENDING', NOW(), NOW()),

('test-signal-2', 'FILING', 'https://sec.gov/filing/test2', 'Google 10-K Filing Shows AI Investment',
'Alphabet Inc. filed its annual 10-K with the SEC, disclosing $32 billion in capital expenditures for 2024, with the majority allocated to AI infrastructure and data centers. The filing emphasizes AI as a strategic priority across all business segments.',
NOW(), 'cmqxolxir0028ekln4sa3hx03', 'PENDING', NOW(), NOW()),

('test-signal-3', 'TRANSCRIPT', 'https://example.com/test3', 'Google Earnings Call Transcript',
'In the Q4 earnings call, CFO Ruth Porat stated: "Our AI-first strategy is delivering results across the board. Cloud revenue grew 26% to $9.2 billion, driven by AI workloads." Sundar Pichai added: "We are seeing unprecedented demand for our AI solutions."',
NOW(), 'cmqxolxir0028ekln4sa3hx03', 'PENDING', NOW(), NOW());

-- Verify insertion
SELECT id, "sourceType", title, status FROM "Signal" WHERE id LIKE 'test-signal-%';
