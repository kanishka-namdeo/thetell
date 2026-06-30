#!/usr/bin/env tsx
/**
 * Detailed Signal Data Analysis
 * Deep dive into specific data quality issues
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

async function runQuery(query: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function detailedAnalysis() {
  console.log('🔍 Detailed Signal Data Analysis\n');
  console.log('═'.repeat(80));

  try {
    // ─── 1. Investigate Signal Status vs Actual Analysis ────────────────────
    console.log('\n1. SIGNAL STATUS vs ACTUAL ANALYSIS:\n');

    const signalStatusCheck = await runQuery(`
      SELECT
        s.status,
        COUNT(s.id) as signal_count,
        COUNT(a.id) as analysis_count,
        COUNT(CASE WHEN a."agentPersona" = 'ANALYST' THEN 1 END) as analyst_count,
        COUNT(CASE WHEN a."agentPersona" = 'GOSSIP_GIRL' THEN 1 END) as gossip_count
      FROM "Signal" s
      LEFT JOIN "Analysis" a ON a."signalId" = s.id
      GROUP BY s.status
      ORDER BY s.status
    `);

    console.log('Signal Status vs Analysis Count:');
    signalStatusCheck.forEach((row) => {
      console.log(`   ${row.status}:`);
      console.log(`     Signals: ${row.signal_count}`);
      console.log(`     Analyses: ${row.analysis_count}`);
      console.log(`     Analyst analyses: ${row.analyst_count}`);
      console.log(`     Gossip Girl analyses: ${row.gossip_count}`);
    });

    // ─── 2. Company-Signal Relationship ─────────────────────────────────────
    console.log('\n2. COMPANY-SIGNAL RELATIONSHIP:\n');

    const companySignals = await runQuery(`
      SELECT
        c.name,
        c.slug,
        COUNT(s.id) as signal_count,
        c.id as company_id
      FROM "Company" c
      LEFT JOIN "Signal" s ON s."companyId" = c.id
      GROUP BY c.id, c.name, c.slug
      ORDER BY signal_count DESC
    `);

    console.log('Company Signal Distribution:');
    companySignals.forEach((row) => {
      const pct = ((row.signal_count / 31) * 100).toFixed(1);
      console.log(`   ${row.name} (${row.slug}): ${row.signal_count} signals (${pct}%)`);
    });

    // ─── 3. Content Analysis ────────────────────────────────────────────────
    console.log('\n3. CONTENT ANALYSIS:\n');

    const contentAnalysis = await runQuery(`
      SELECT
        s.id,
        s.title,
        s."sourceType",
        s.status,
        LENGTH(s."rawContent") as content_length,
        s."publishedAt",
        s."scrapedAt",
        EXTRACT(DAYS FROM s."scrapedAt" - s."publishedAt") as days_after_publication,
        s."scraperName",
        s."dataOrigin",
        CASE WHEN s."embedding" IS NULL THEN 'No' ELSE 'Yes' END as has_embedding,
        CASE WHEN s."metadata" IS NULL THEN 'No' ELSE 'Yes' END as has_metadata,
        CASE WHEN s."engagement" IS NULL THEN 'No' ELSE 'Yes' END as has_engagement
      FROM "Signal" s
      ORDER BY s."publishedAt" DESC
    `);

    console.log('Signal Details (first 10):');
    contentAnalysis.slice(0, 10).forEach((row, idx) => {
      console.log(`\n   ${idx + 1}. ${row.title}`);
      console.log(`      Type: ${row.sourceType} | Status: ${row.status}`);
      console.log(`      Length: ${row.content_length} chars`);
      console.log(`      Published: ${row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : 'N/A'}`);
      console.log(`      Scraped: ${new Date(row.scrapedAt).toLocaleDateString()}`);
      if (row.days_after_publication) {
        console.log(`      Days after publication: ${Math.round(row.days_after_publication)}`);
      }
      console.log(`      Scraper: ${row.scraperName}`);
      console.log(`      Origin: ${row.dataOrigin}`);
      console.log(`      Embedding: ${row.has_embedding} | Metadata: ${row.has_metadata} | Engagement: ${row.has_engagement}`);
    });

    // ─── 4. Scraper Performance ─────────────────────────────────────────────
    console.log('\n4. SCRAPER PERFORMANCE:\n');

    const scraperStats = await runQuery(`
      SELECT
        "scraperName",
        COUNT(*) as signal_count,
        ROUND(AVG(LENGTH("rawContent")), 0) as avg_content_length,
        MIN("scrapedAt") as first_scraped,
        MAX("scrapedAt") as last_scraped
      FROM "Signal"
      WHERE "scraperName" IS NOT NULL
      GROUP BY "scraperName"
      ORDER BY signal_count DESC
    `);

    console.log('Scraper Statistics:');
    scraperStats.forEach((row) => {
      console.log(`   ${row.scraperName}:`);
      console.log(`     Signals: ${row.signal_count}`);
      console.log(`     Avg content length: ${row.avg_content_length} chars`);
      console.log(`     First scraped: ${row.first_scraped}`);
      console.log(`     Last scraped: ${row.last_scraped}`);
    });

    // ─── 5. Source Type Analysis ────────────────────────────────────────────
    console.log('\n5. SOURCE TYPE ANALYSIS:\n');

    const sourceTypeAnalysis = await runQuery(`
      SELECT
        "sourceType",
        COUNT(*) as count,
        ROUND(AVG(LENGTH("rawContent")), 0) as avg_content_length,
        ROUND(AVG(EXTRACT(EPOCH FROM ("scrapedAt" - "publishedAt"))/86400), 1) as avg_days_to_scrape
      FROM "Signal"
      WHERE "publishedAt" IS NOT NULL
      GROUP BY "sourceType"
      ORDER BY count DESC
    `);

    console.log('Source Type Statistics:');
    sourceTypeAnalysis.forEach((row) => {
      console.log(`   ${row.sourceType}:`);
      console.log(`     Count: ${row.count}`);
      console.log(`     Avg content length: ${row.avg_content_length} chars`);
      console.log(`     Avg days to scrape: ${row.avg_days_to_scrape}`);
    });

    // ─── 6. Temporal Patterns ───────────────────────────────────────────────
    console.log('\n6. TEMPORAL PATTERNS:\n');

    const temporalPatterns = await runQuery(`
      SELECT
        EXTRACT(YEAR FROM "publishedAt") as year,
        EXTRACT(MONTH FROM "publishedAt") as month,
        COUNT(*) as signal_count,
        MIN("scrapedAt") as first_scraped,
        MAX("scrapedAt") as last_scraped
      FROM "Signal"
      WHERE "publishedAt" IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM "publishedAt"), EXTRACT(MONTH FROM "publishedAt")
      ORDER BY year, month
    `);

    console.log('Publication Timeline:');
    temporalPatterns.forEach((row) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNames[parseInt(row.month) - 1];
      console.log(`   ${row.year}-${monthName}: ${row.signal_count} signals`);
    });

    // ─── 7. Data Completeness Matrix ────────────────────────────────────────
    console.log('\n7. DATA COMPLETENESS MATRIX:\n');

    const completenessCheck = await runQuery(`
      SELECT
        'rawContent' as field,
        COUNT(CASE WHEN "rawContent" IS NOT NULL AND "rawContent" != '' THEN 1 END) as present,
        COUNT(CASE WHEN "rawContent" IS NULL OR "rawContent" = '' THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "rawContent" IS NOT NULL AND "rawContent" != '' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      UNION ALL
      SELECT
        'title' as field,
        COUNT(CASE WHEN "title" IS NOT NULL AND "title" != '' THEN 1 END) as present,
        COUNT(CASE WHEN "title" IS NULL OR "title" = '' THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "title" IS NOT NULL AND "title" != '' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      UNION ALL
      SELECT
        'publishedAt' as field,
        COUNT(CASE WHEN "publishedAt" IS NOT NULL THEN 1 END) as present,
        COUNT(CASE WHEN "publishedAt" IS NULL THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "publishedAt" IS NOT NULL THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      UNION ALL
      SELECT
        'embedding' as field,
        COUNT(CASE WHEN "embedding" IS NOT NULL THEN 1 END) as present,
        COUNT(CASE WHEN "embedding" IS NULL THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "embedding" IS NOT NULL THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      UNION ALL
      SELECT
        'metadata' as field,
        COUNT(CASE WHEN "metadata" IS NOT NULL THEN 1 END) as present,
        COUNT(CASE WHEN "metadata" IS NULL THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "metadata" IS NOT NULL THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      UNION ALL
      SELECT
        'engagement' as field,
        COUNT(CASE WHEN "engagement" IS NOT NULL THEN 1 END) as present,
        COUNT(CASE WHEN "engagement" IS NULL THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "engagement" IS NOT NULL THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      UNION ALL
      SELECT
        'author' as field,
        COUNT(CASE WHEN "author" IS NOT NULL AND "author" != '' THEN 1 END) as present,
        COUNT(CASE WHEN "author" IS NULL OR "author" = '' THEN 1 END) as missing,
        ROUND(COUNT(CASE WHEN "author" IS NOT NULL AND "author" != '' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1) as completeness_pct
      FROM "Signal"
      ORDER BY completeness_pct DESC
    `);

    console.log('Field Completeness:');
    completenessCheck.forEach((row) => {
      const pct = parseFloat(row.completeness_pct);
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`   ${row.field.padEnd(15)} | ${bar.padEnd(20)} | ${pct.toFixed(1)}% (${row.present}/${row.present + row.missing})`);
    });

    // ─── 8. Potential Data Issues ───────────────────────────────────────────
    console.log('\n8. POTENTIAL DATA ISSUES:\n');

    // Check for duplicate URLs
    const duplicateUrls = await runQuery(`
      SELECT
        "sourceUrl",
        COUNT(*) as duplicate_count
      FROM "Signal"
      GROUP BY "sourceUrl"
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `);

    if (duplicateUrls.length > 0) {
      console.log('⚠️  Duplicate URLs found:');
      duplicateUrls.forEach((row) => {
        console.log(`   ${row.sourceUrl} (${row.duplicate_count} times)`);
      });
    } else {
      console.log('✅ No duplicate URLs found');
    }

    // Check for duplicate content hashes
    const duplicateHashes = await runQuery(`
      SELECT
        "contentHash",
        COUNT(*) as duplicate_count
      FROM "Signal"
      WHERE "contentHash" IS NOT NULL
      GROUP BY "contentHash"
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `);

    if (duplicateHashes.length > 0) {
      console.log('\n⚠️  Duplicate content hashes found:');
      duplicateHashes.forEach((row) => {
        console.log(`   Hash ${row.contentHash?.slice(0, 20)}... (${row.duplicate_count} times)`);
      });
    } else {
      console.log('\n✅ No duplicate content hashes found');
    }

    // Check for future dates
    const futureDates = await runQuery(`
      SELECT
        id,
        title,
        "publishedAt"
      FROM "Signal"
      WHERE "publishedAt" > NOW()
    `);

    if (futureDates.length > 0) {
      console.log('\n⚠️  Signals with future publication dates:');
      futureDates.forEach((row) => {
        console.log(`   ${row.title} (${row.publishedAt})`);
      });
    } else {
      console.log('\n✅ No future publication dates found');
    }

    // Check for very old dates
    const oldDates = await runQuery(`
      SELECT
        id,
        title,
        "publishedAt"
      FROM "Signal"
      WHERE "publishedAt" < '2020-01-01'
    `);

    if (oldDates.length > 0) {
      console.log('\n⚠️  Signals with very old publication dates (< 2020):');
      oldDates.forEach((row) => {
        console.log(`   ${row.title} (${row.publishedAt})`);
      });
    }

    console.log('\n' + '═'.repeat(80));
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

detailedAnalysis();
