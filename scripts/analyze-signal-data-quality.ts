#!/usr/bin/env tsx
/**
 * Signal Data Quality Analysis
 * Analyzes signal data in the database to identify quality issues, missing data, and incorrect capture
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as pg from 'pg';

// Parse .env.local
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

const DATABASE_URL = envVars.DATABASE_URL;
const url = new URL(DATABASE_URL);

const pool = new pg.Pool({
  host: url.hostname,
  port: parseInt(url.port),
  database: url.pathname.slice(1),
  user: url.username,
  password: url.password,
});

interface AnalysisResult {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  count?: number;
  percentage?: number;
  examples?: any[];
  recommendations?: string[];
}

async function runQuery(query: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function analyzeSignalDataQuality() {
  console.log('🔍 Signal Data Quality Analysis\n');
  console.log('═'.repeat(80));

  const issues: AnalysisResult[] = [];
  const recommendations: string[] = [];

  try {
    // ─── Summary Stats ──────────────────────────────────────────────────────
    const totalSignals = await runQuery('SELECT COUNT(*) as count FROM "Signal"');
    const totalCompanies = await runQuery('SELECT COUNT(*) as count FROM "Company"');
    const totalAnalyses = await runQuery('SELECT COUNT(*) as count FROM "Analysis"');

    const signalCount = parseInt(totalSignals[0].count);
    const companyCount = parseInt(totalCompanies[0].count);
    const analysisCount = parseInt(totalAnalyses[0].count);

    console.log('📊 Summary:');
    console.log(`   Total signals: ${signalCount.toLocaleString()}`);
    console.log(`   Total companies: ${companyCount.toLocaleString()}`);
    console.log(`   Total analyses: ${analysisCount.toLocaleString()}`);
    console.log('');

    if (signalCount === 0) {
      console.log('⚠️  No signals found in database.');
      await pool.end();
      return;
    }

    // ─── 1. Signal Status Distribution ──────────────────────────────────────
    console.log('📈 Signal Status Distribution:');
    const statusDist = await runQuery(`
      SELECT status, COUNT(*) as count
      FROM "Signal"
      GROUP BY status
      ORDER BY count DESC
    `);

    statusDist.forEach((row) => {
      const pct = ((row.count / signalCount) * 100).toFixed(1);
      console.log(`   ${row.status}: ${row.count} (${pct}%)`);
    });
    console.log('');

    // ─── 2. Missing Critical Fields ─────────────────────────────────────────
    console.log('🔎 Data Quality Issues:\n');

    // Empty raw content
    const emptyContent = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "rawContent" IS NULL OR "rawContent" = ''
    `);

    if (parseInt(emptyContent[0].count) > 0) {
      const count = parseInt(emptyContent[0].count);
      issues.push({
        title: 'Signals with empty raw content',
        severity: 'critical',
        description: 'Signals exist with no raw content, making analysis impossible. This indicates scraping failures.',
        count,
        percentage: (count / signalCount) * 100,
        recommendations: ['Implement proper error handling for failed scrapes', 'Add validation before saving signals'],
      });
    }

    // Empty titles
    const emptyTitles = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "title" IS NULL OR "title" = ''
    `);

    if (parseInt(emptyTitles[0].count) > 0) {
      const count = parseInt(emptyTitles[0].count);
      issues.push({
        title: 'Signals with empty titles',
        severity: 'high',
        description: 'Signals without titles indicate incomplete scraping or parsing failures.',
        count,
        percentage: (count / signalCount) * 100,
        recommendations: ['Add fallback title extraction', 'Validate title presence before saving'],
      });
    }

    // Missing publishedAt
    const missingDates = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "publishedAt" IS NULL
    `);

    if (parseInt(missingDates[0].count) > 0) {
      const count = parseInt(missingDates[0].count);
      issues.push({
        title: 'Signals without publication dates',
        severity: 'medium',
        description: 'Missing publication dates make temporal analysis and trend detection difficult.',
        count,
        percentage: (count / signalCount) * 100,
        recommendations: ['Improve date extraction logic', 'Add fallback to scrapedAt if publishedAt unavailable'],
      });
    }

    // Missing embeddings
    const missingEmbeddings = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "embedding" IS NULL
    `);

    if (parseInt(missingEmbeddings[0].count) > 0) {
      const count = parseInt(missingEmbeddings[0].count);
      issues.push({
        title: 'Signals without embeddings',
        severity: 'high',
        description: 'Signals without embeddings cannot be used for semantic search, similarity detection, or cross-signal correlation.',
        count,
        percentage: (count / signalCount) * 100,
        recommendations: ['Implement mandatory embedding generation', 'Add embedding generation to analysis pipeline'],
      });
    }

    // Missing metadata
    const missingMetadata = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "metadata" IS NULL
    `);

    if (parseInt(missingMetadata[0].count) > 0) {
      const count = parseInt(missingMetadata[0].count);
      issues.push({
        title: 'Signals without metadata',
        severity: 'medium',
        description: 'Missing metadata limits context and debugging capabilities.',
        count,
        percentage: (count / signalCount) * 100,
      });
    }

    // Missing author
    const missingAuthor = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "author" IS NULL
    `);

    // Missing engagement
    const missingEngagement = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "engagement" IS NULL
    `);

    // ─── 3. Analysis Coverage ───────────────────────────────────────────────
    console.log('📈 Analysis Coverage:');

    const signalsWithAnalysis = await runQuery(`
      SELECT COUNT(DISTINCT s.id) as count
      FROM "Signal" s
      INNER JOIN "Analysis" a ON a."signalId" = s.id
    `);

    const withAnalysisCount = parseInt(signalsWithAnalysis[0].count);
    const coveragePct = ((withAnalysisCount / signalCount) * 100).toFixed(1);
    console.log(`   Signals with analysis: ${withAnalysisCount} (${coveragePct}%)`);

    // Dual-agent coverage
    const dualAgentCoverage = await runQuery(`
      SELECT COUNT(*) as count
      FROM (
        SELECT "signalId"
        FROM "Analysis"
        GROUP BY "signalId"
        HAVING COUNT(CASE WHEN "agentPersona" = 'ANALYST' THEN 1 END) > 0
           AND COUNT(CASE WHEN "agentPersona" = 'GOSSIP_GIRL' THEN 1 END) > 0
      ) as dual
    `);

    const dualCount = parseInt(dualAgentCoverage[0].count);
    const dualPct = ((dualCount / signalCount) * 100).toFixed(1);
    console.log(`   Signals with dual-agent analysis: ${dualCount} (${dualPct}%)`);

    if (dualCount < signalCount * 0.5) {
      issues.push({
        title: 'Low dual-agent coverage',
        severity: 'medium',
        description: `Only ${dualPct}% of signals have both Analyst and Gossip Girl perspectives. The dual-agent system is designed to provide complementary insights.`,
        count: signalCount - dualCount,
        percentage: 100 - parseFloat(dualPct),
        recommendations: ['Ensure both agents analyze each signal', 'Add dual-agent requirement to analysis pipeline'],
      });
    }

    console.log('');

    // ─── 4. Source Type Distribution ────────────────────────────────────────
    console.log('📈 Source Type Distribution:');
    const sourceTypeDist = await runQuery(`
      SELECT "sourceType", COUNT(*) as count
      FROM "Signal"
      GROUP BY "sourceType"
      ORDER BY count DESC
    `);

    sourceTypeDist.forEach((row) => {
      const pct = ((row.count / signalCount) * 100).toFixed(1);
      console.log(`   ${row.sourceType}: ${row.count} (${pct}%)`);
    });
    console.log('');

    // ─── 5. Sentiment Distribution ──────────────────────────────────────────
    console.log('📈 Sentiment Distribution:');
    const sentimentDist = await runQuery(`
      SELECT sentiment, COUNT(*) as count
      FROM "Analysis"
      GROUP BY sentiment
      ORDER BY count DESC
    `);

    sentimentDist.forEach((row) => {
      const pct = ((row.count / analysisCount) * 100).toFixed(1);
      console.log(`   ${row.sentiment}: ${row.count} (${pct}%)`);
    });
    console.log('');

    // ─── 6. Content Quality Metrics ─────────────────────────────────────────
    console.log('📈 Content Quality:');

    const contentLengthStats = await runQuery(`
      SELECT
        MIN(LENGTH("rawContent")) as min_len,
        MAX(LENGTH("rawContent")) as max_len,
        ROUND(AVG(LENGTH("rawContent"))) as avg_len,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH("rawContent")) as median_len
      FROM "Signal"
      WHERE "rawContent" IS NOT NULL AND "rawContent" != ''
    `);

    const stats = contentLengthStats[0];
    console.log(`   Average content length: ${stats.avg_len} characters`);
    console.log(`   Min content length: ${stats.min_len} characters`);
    console.log(`   Max content length: ${stats.max_len} characters`);
    console.log(`   Median content length: ${stats.median_len} characters`);

    const veryShortContent = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "rawContent" IS NOT NULL
        AND "rawContent" != ''
        AND LENGTH("rawContent") < 100
    `);

    const veryShortCount = parseInt(veryShortContent[0].count);
    if (veryShortCount > 0) {
      console.log(`   ⚠️  ${veryShortCount} signals with very short content (<100 chars)`);
      issues.push({
        title: 'Very short signal content',
        severity: 'medium',
        description: `Found ${veryShortCount} signals with extremely short content (<100 characters). These are likely extraction failures or low-value content.`,
        count: veryShortCount,
        percentage: (veryShortCount / signalCount) * 100,
        recommendations: ['Add minimum content length validation', 'Implement content quality scoring'],
      });
    }

    console.log('');

    // ─── 7. Company Association ─────────────────────────────────────────────
    console.log('📈 Company Coverage:');

    const companiesWithSignals = await runQuery(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM "Company" c
      LEFT JOIN "Signal" s ON s."companyId" = c.id
      WHERE s.id IS NOT NULL
    `);

    const withSignals = parseInt(companiesWithSignals[0].count);
    const withoutSignals = companyCount - withSignals;

    console.log(`   Companies with signals: ${withSignals}`);
    console.log(`   Companies without signals: ${withoutSignals}`);

    if (withoutSignals > 0) {
      console.log(`   ⚠️  ${withoutSignals} companies have no signals collected yet`);
      issues.push({
        title: 'Companies without signals',
        severity: 'high',
        description: 'Some tracked companies have no associated signals, indicating discovery pipeline failures or missing data sources.',
        count: withoutSignals,
        recommendations: ['Review company data sources', 'Improve scraper coverage for these companies'],
      });
    }

    console.log('');

    // ─── 8. Data Origin ─────────────────────────────────────────────────────
    console.log('📈 Data Origin:');
    const dataOriginDist = await runQuery(`
      SELECT "dataOrigin", COUNT(*) as count
      FROM "Signal"
      GROUP BY "dataOrigin"
      ORDER BY count DESC
    `);

    dataOriginDist.forEach((row) => {
      const pct = ((row.count / signalCount) * 100).toFixed(1);
      console.log(`   ${row.dataOrigin}: ${row.count} (${pct}%)`);
    });
    console.log('');

    // ─── 9. Scraping Provenance ─────────────────────────────────────────────
    console.log('📈 Scraping Provenance:');

    const withScraper = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "scraperName" IS NOT NULL
    `);

    console.log(`   Signals with scraper name: ${withScraper[0].count} (${((withScraper[0].count / signalCount) * 100).toFixed(1)}%)`);

    const withMultipleAttempts = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "scrapeAttempts" > 1
    `);

    if (parseInt(withMultipleAttempts[0].count) > 0) {
      console.log(`   ⚠️  ${withMultipleAttempts[0].count} signals required multiple scrape attempts`);
    }

    const unverified = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "verified" = false
    `);

    console.log(`   Unverified signals: ${unverified[0].count} (${((unverified[0].count / signalCount) * 100).toFixed(1)}%)`);
    console.log('');

    // ─── 10. Temporal Analysis ──────────────────────────────────────────────
    console.log('📈 Temporal Analysis:');

    const dateRange = await runQuery(`
      SELECT
        MIN("publishedAt") as earliest_published,
        MAX("publishedAt") as latest_published,
        MIN("scrapedAt") as earliest_scraped,
        MAX("scrapedAt") as latest_scraped
      FROM "Signal"
    `);

    console.log(`   Earliest published: ${dateRange[0].earliest_published || 'N/A'}`);
    console.log(`   Latest published: ${dateRange[0].latest_published || 'N/A'}`);
    console.log(`   Earliest scraped: ${dateRange[0].earliest_scraped || 'N/A'}`);
    console.log(`   Latest scraped: ${dateRange[0].latest_scraped || 'N/A'}`);

    const futureSignals = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "publishedAt" > NOW()
    `);

    if (parseInt(futureSignals[0].count) > 0) {
      console.log(`   ⚠️  ${futureSignals[0].count} signals have future publication dates`);
      issues.push({
        title: 'Future publication dates',
        severity: 'high',
        description: 'Some signals have publication dates in the future, indicating date parsing errors.',
        count: parseInt(futureSignals[0].count),
        recommendations: ['Add date validation', 'Fix date parsing logic'],
      });
    }

    // Stale signals (scraped >30 days after publication)
    const staleSignals = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Signal"
      WHERE "publishedAt" IS NOT NULL
        AND "scrapedAt" IS NOT NULL
        AND EXTRACT(DAYS FROM "scrapedAt" - "publishedAt") > 30
    `);

    if (parseInt(staleSignals[0].count) > 0) {
      console.log(`   ⚠️  ${staleSignals[0].count} signals were scraped >30 days after publication`);
      issues.push({
        title: 'Stale signal discovery',
        severity: 'medium',
        description: 'Some signals were discovered long after publication, reducing timeliness and value.',
        count: parseInt(staleSignals[0].count),
        recommendations: ['Improve discovery frequency', 'Add real-time monitoring for key sources'],
      });
    }

    console.log('');

    // ─── 11. Analysis Quality ───────────────────────────────────────────────
    console.log('📈 Analysis Quality:');

    // Confidence score distribution
    const confidenceStats = await runQuery(`
      SELECT
        ROUND(AVG(confidence)::numeric, 3) as avg_confidence,
        MIN(confidence) as min_confidence,
        MAX(confidence) as max_confidence,
        ROUND(
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY confidence)::numeric,
          3
        ) as median_confidence
      FROM "Analysis"
    `);

    console.log(`   Average confidence: ${confidenceStats[0].avg_confidence}`);
    console.log(`   Min confidence: ${confidenceStats[0].min_confidence}`);
    console.log(`   Max confidence: ${confidenceStats[0].max_confidence}`);
    console.log(`   Median confidence: ${confidenceStats[0].median_confidence}`);

    // Check for invalid confidence scores
    const invalidConfidence = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Analysis"
      WHERE confidence < 0 OR confidence > 1
    `);

    if (parseInt(invalidConfidence[0].count) > 0) {
      console.log(`   ⚠️  ${invalidConfidence[0].count} analyses have invalid confidence scores (outside 0-1 range)`);
      issues.push({
        title: 'Invalid confidence scores',
        severity: 'high',
        description: 'Some analyses have confidence scores outside the valid [0, 1] range, indicating bugs in confidence calculation.',
        count: parseInt(invalidConfidence[0].count),
        recommendations: ['Add confidence score validation', 'Fix confidence calculation logic'],
      });
    }

    // Check for missing sentiment data
    const missingSentimentData = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Analysis"
      WHERE "sentimentData" IS NULL
    `);

    if (parseInt(missingSentimentData[0].count) > 0) {
      console.log(`   ⚠️  ${missingSentimentData[0].count} analyses missing detailed sentiment data`);
    }

    console.log('');

    // ─── 12. Cross-Signal Correlations ──────────────────────────────────────
    console.log('📈 Cross-Signal Correlations:');

    const inferencesCount = await runQuery('SELECT COUNT(*) as count FROM "Inference"');
    console.log(`   Total inferences: ${inferencesCount[0].count}`);

    const inferencesWithoutSignals = await runQuery(`
      SELECT COUNT(*) as count
      FROM "Inference"
      WHERE "supportingSignalIds" = '[]'::jsonb
    `);

    if (parseInt(inferencesWithoutSignals[0].count) > 0) {
      console.log(`   ⚠️  ${inferencesWithoutSignals[0].count} inferences have no supporting signals`);
      issues.push({
        title: 'Inferences without supporting signals',
        severity: 'high',
        description: 'Some inferences exist without any supporting signals, making them unsubstantiated.',
        count: parseInt(inferencesWithoutSignals[0].count),
        recommendations: ['Add validation to inference generation', 'Ensure supporting signals are always linked'],
      });
    }

    const themesCount = await runQuery('SELECT COUNT(*) as count FROM "SignalTheme"');
    console.log(`   Total signal themes: ${themesCount[0].count}`);

    console.log('');

    // ─── Summary Report ─────────────────────────────────────────────────────
    console.log('═'.repeat(80));
    console.log('\n📋 DATA QUALITY REPORT:\n');

    if (issues.length === 0) {
      console.log('   ✅ No critical data quality issues found!');
    } else {
      const critical = issues.filter((i) => i.severity === 'critical');
      const high = issues.filter((i) => i.severity === 'high');
      const medium = issues.filter((i) => i.severity === 'medium');
      const low = issues.filter((i) => i.severity === 'low');

      console.log(`   Total Issues: ${issues.length}`);
      if (critical.length > 0) console.log(`   🔴 Critical: ${critical.length}`);
      if (high.length > 0) console.log(`   🟠 High: ${high.length}`);
      if (medium.length > 0) console.log(`   🟡 Medium: ${medium.length}`);
      if (low.length > 0) console.log(`   🟢 Low: ${low.length}`);
      console.log('');

      // Print detailed issues
      issues.forEach((issue, idx) => {
        const icon = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢',
          info: 'ℹ️',
        }[issue.severity];

        console.log(`   ${icon} ${issue.title}`);
        console.log(`      ${issue.description}`);
        if (issue.count !== undefined) {
          console.log(`      Count: ${issue.count.toLocaleString()}${issue.percentage ? ` (${issue.percentage.toFixed(1)}%)` : ''}`);
        }
        if (issue.recommendations && issue.recommendations.length > 0) {
          console.log('      Recommendations:');
          issue.recommendations.forEach((rec) => console.log(`        • ${rec}`));
        }
        console.log('');
      });
    }

    // ─── Recommendations Summary ────────────────────────────────────────────
    const allRecommendations = issues
      .flatMap((i) => i.recommendations || [])
      .filter(Boolean);

    if (allRecommendations.length > 0) {
      console.log('═'.repeat(80));
      console.log('\n📋 PRIORITIZED ACTION ITEMS:\n');

      // Deduplicate and prioritize
      const uniqueRecs = [...new Set(allRecommendations)];
      uniqueRecs.forEach((rec, idx) => {
        console.log(`   ${idx + 1}. ${rec}`);
      });
    }

    console.log('\n' + '═'.repeat(80) + '\n');

    // ─── Sample Data ────────────────────────────────────────────────────────
    console.log('📄 Sample Signals:\n');

    const sampleSignals = await runQuery(`
      SELECT
        id,
        title,
        "sourceType",
        status,
        LENGTH("rawContent") as content_length,
        "publishedAt",
        "scrapedAt",
        "scraperName"
      FROM "Signal"
      ORDER BY "scrapedAt" DESC
      LIMIT 5
    `);

    sampleSignals.forEach((signal, idx) => {
      console.log(`   ${idx + 1}. ${signal.title}`);
      console.log(`      Type: ${signal.sourceType} | Status: ${signal.status}`);
      console.log(`      Content length: ${signal.content_length} chars`);
      console.log(`      Published: ${signal.publishedAt || 'N/A'}`);
      console.log(`      Scraped: ${signal.scrapedAt}`);
      console.log(`      Scraper: ${signal.scraperName || 'unknown'}`);
      console.log('');
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

analyzeSignalDataQuality();
