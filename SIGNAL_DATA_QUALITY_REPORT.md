# Signal Data Quality Analysis Report

**Date:** June 25, 2026
**Database:** PostgreSQL (localhost:5433)
**Analysis Scope:** All signals, companies, and related data

---

## Executive Summary

The Tell's database contains **31 signals** across **5 companies**, with all signals marked as `ANALYZED` status. However, the analysis reveals **critical gaps in data completeness and processing**:

- 🔴 **0 analyses actually exist** despite signals being marked as ANALYZED
- 🔴 **100% of signals lack embeddings** (blocking semantic search and correlation)
- 🟠 **1 company has no signals** at all
- 🟡 **14 signals (45%) were scraped >30 days after publication** (stale discovery)
- 🟡 **100% lack metadata** (limiting debugging and context)

**Root Cause:** The system appears to have bootstrap data that was marked as ANALYZED without actually running through the full analysis pipeline. This suggests a data seeding or migration issue rather than live scraping problems.

---

## Key Findings

### 1. Analysis Pipeline Not Executed 🔴 CRITICAL

**Finding:** 0 analyses exist in the database despite all 31 signals having `ANALYZED` status.

**Impact:**
- No sentiment analysis available
- No dual-agent perspectives (Analyst + Gossip Girl)
- No confidence scores
- No strategic theme extraction
- No cross-signal correlations possible

**Root Cause:** Signals were likely bootstrapped/seeded with status set to ANALYZED without actually processing them through the analysis pipeline.

**Evidence:**
```
Total signals: 31
Total analyses: 0
Signals with analysis: 0 (0.0%)
Signals with dual-agent analysis: 0 (0.0%)
```

### 2. Missing Embeddings 🔴 HIGH

**Finding:** 100% of signals (31/31) have no embeddings.

**Impact:**
- Cannot perform semantic search
- Cannot detect duplicate or similar content
- Cannot run cross-signal correlation
- Cannot cluster signals by theme
- Defeats the core value proposition of "connecting the dots"

**Root Cause:** Embedding generation is likely not part of the bootstrap/seed process, or the NLP pipeline is not running.

### 3. Incomplete Company Coverage 🟠 HIGH

**Finding:** 1 out of 5 companies (20%) has zero signals.

**Impact:**
- Incomplete market coverage
- Gaps in competitive intelligence
- Missed strategic insights for that company

**Recommendation:** Review data sources for the company without signals and ensure scraper coverage.

### 4. Stale Signal Discovery 🟡 MEDIUM

**Finding:** 14 signals (45%) were scraped more than 30 days after their publication date.

**Impact:**
- Reduced timeliness of insights
- Missed early detection opportunities
- Lower value for time-sensitive analysis

**Example:** A signal published on March 17, 2025 was only scraped on June 25, 2026 (>15 months later).

**Root Cause:** Bootstrap data includes historical content that wasn't discovered in real-time.

### 5. Missing Metadata 🟡 MEDIUM

**Finding:** 100% of signals lack metadata.

**Impact:**
- No engagement metrics (likes, shares, comments)
- No source reliability scores
- Limited debugging information
- Missing scraping context

### 6. Limited Source Diversity 🟡 MEDIUM

**Finding:** Only 2 source types represented:
- NEWS: 20 signals (64.5%)
- BLOG: 11 signals (35.5%)

**Missing source types:**
- No SEC filings
- No earnings call transcripts
- No social media
- No job postings
- No patents
- No litigation records
- No FDA filings
- No government contracts

**Impact:** Incomplete signal coverage limits the platform's ability to "read between the lines" across different signal types.

### 7. Data Origin: All Bootstrap 🟡 MEDIUM

**Finding:** 100% of signals have `dataOrigin = BOOTSTRAP`.

**Impact:**
- No live scraping data
- No real-time signal ingestion
- System not in production use

**Interpretation:** This appears to be a development/test environment with seeded data, not a production system.

---

## Data Quality Metrics

### Content Quality ✅ GOOD

- **Average content length:** 4,851 characters (good)
- **Minimum content length:** 109 characters (acceptable)
- **Maximum content length:** 19,200 characters (good)
- **Median content length:** 2,044 characters (good)

No signals with empty or very short content (<100 chars). Content extraction appears to be working well.

### Scraping Provenance ✅ GOOD

- **100% have scraper names** (good traceability)
- **0 unverified signals** (neutral - verification may not be implemented)
- **No signals required multiple scrape attempts** (good reliability)

### Temporal Distribution ⚠️ MIXED

- **Date range:** March 17, 2025 → June 24, 2026
- **Scraping window:** June 25, 2026 (all scraped on same day)
- **45% stale discoveries** (>30 days after publication)

This confirms the data is bootstrapped historical content, not live scraping.

---

## Sample Data

The database contains signals about AI/LLM topics (based on sample titles):

1. "Competing against yourself" (Blog, 10,319 chars)
2. "When your agent extensions fight each other" (Blog, 12,287 chars)
3. "Stop overloading your skills" (Blog, 3,706 chars)
4. "Models don't have preferences, they have context" (Blog, 4,854 chars)
5. "When the model has never seen your code" (Blog, 19,200 chars)

All appear to be from a technical blog about AI agents and LLM development.

---

## Prioritized Recommendations

### Immediate (Critical)

1. **Run the analysis pipeline on all signals**
   - Execute `analyzeSignalWithAgent()` for each signal
   - Generate both Analyst and Gossip Girl perspectives
   - Populate the Analysis table

2. **Generate embeddings for all signals**
   - Run embedding generation pipeline
   - Store in Signal.embedding field
   - Enable semantic search and correlation

3. **Fix data origin tracking**
   - Distinguish between bootstrap and live-scraped data
   - Add proper provenance metadata

### Short-term (High Priority)

4. **Add missing metadata**
   - Engagement metrics (where applicable)
   - Source reliability scores
   - Scraping context

5. **Expand source type coverage**
   - Add SEC filing scrapers
   - Add transcript scrapers
   - Add social media monitoring
   - Add job posting scrapers

6. **Improve discovery timeliness**
   - Implement real-time monitoring for key sources
   - Reduce discovery latency
   - Add scheduled re-scraping for updated content

### Medium-term (Medium Priority)

7. **Review company coverage**
   - Investigate the company with no signals
   - Ensure data sources are configured
   - Add missing scrapers if needed

8. **Implement data validation**
   - Add checks before marking signals as ANALYZED
   - Validate required fields (embeddings, analyses)
   - Prevent incomplete data from entering production

---

## Conclusion

The Tell's database contains **well-structured but incomplete data**. The core content extraction is working (good content length, proper scraping), but the **analysis and enrichment pipelines have not been executed**. This appears to be a development or staging environment with bootstrapped data rather than a production system.

**Next Steps:**
1. Run the full analysis pipeline on all 31 signals
2. Generate embeddings
3. Add metadata enrichment
4. Expand source type coverage
5. Implement live scraping to replace bootstrap data

Once these steps are complete, the platform will be able to deliver on its core value proposition: connecting dots across signal types to predict corporate strategy.

---

**Analysis performed by:** Signal Data Quality Script
**Script location:** `scripts/analyze-signal-data-quality.ts`
**Database:** PostgreSQL via Prisma ORM
