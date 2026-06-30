#!/usr/bin/env tsx
/**
 * Signal Data Quality Analysis
 * Analyzes signal data in the database to identify quality issues
 */

// Set environment variables before importing prisma
import { readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Now import prisma after setting env
import { prisma } from '../src/lib/db';
import { Prisma } from '@prisma/client';

async function main() {
  try {
    console.log('🔍 Signal Data Quality Analysis\n');
    console.log('═'.repeat(80));

    await prisma.$connect();
    console.log('✅ Connected to database\n');

    // ─── Summary Stats ──────────────────────────────────────────────────────
    const totalSignals = await prisma.signal.count();
    const totalCompanies = await prisma.company.count();
    const totalAnalyses = await prisma.analysis.count();

    console.log('📊 Summary:');
    console.log(`   Total signals: ${totalSignals.toLocaleString()}`);
    console.log(`   Total companies: ${totalCompanies.toLocaleString()}`);
    console.log(`   Total analyses: ${totalAnalyses.toLocaleString()}`);
    console.log('');

    if (totalSignals === 0) {
      console.log('⚠️  No signals found in database. The system may not have collected any data yet.');
      await prisma.$disconnect();
      return;
    }

    // ─── 1. Signal Status Distribution ──────────────────────────────────────
    console.log('📈 Signal Status Distribution:');
    const statusDistribution = await prisma.signal.groupBy({
      by: ['status'],
      _count: true,
      orderBy: {
        _count: { status: 'desc' },
      },
    });

    statusDistribution.forEach((s) => {
      const percentage = ((s._count / totalSignals) * 100).toFixed(1);
      console.log(`   ${s.status}: ${s._count.toLocaleString()} (${percentage}%)`);
    });
    console.log('');

    // ─── 2. Missing Critical Fields ─────────────────────────────────────────
    console.log('🔎 Data Quality Issues:\n');

    // Check for empty content
    const emptyContentSignals = await prisma.signal.count({
      where: {
        rawContent: '',
      },
    });

    if (emptyContentSignals > 0) {
      console.log(`🔴 CRITICAL: ${emptyContentSignals} signals with empty raw content (${((emptyContentSignals / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Signals exist with no raw content, making analysis impossible.\n');
    }

    // Check for empty titles
    const emptyTitleSignals = await prisma.signal.count({
      where: {
        title: '',
      },
    });

    if (emptyTitleSignals > 0) {
      console.log(`🟠 HIGH: ${emptyTitleSignals} signals with empty titles (${((emptyTitleSignals / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Signals without titles indicate incomplete scraping.\n');
    }

    // Check for missing publishedAt
    const missingPublishedAt = await prisma.signal.count({
      where: { publishedAt: { equals: null } },
    });

    if (missingPublishedAt > 0) {
      console.log(`🟡 MEDIUM: ${missingPublishedAt} signals without publication dates (${((missingPublishedAt / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Missing dates make temporal analysis difficult.\n');
    }

    // Check for missing embeddings
    const signalsWithoutEmbeddings = await prisma.signal.count({
      where: { embedding: { equals: Prisma.JsonNull } },
    });

    if (signalsWithoutEmbeddings > 0) {
      console.log(`🟠 HIGH: ${signalsWithoutEmbeddings} signals without embeddings (${((signalsWithoutEmbeddings / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Signals without embeddings cannot be used for semantic search or correlation.\n');
    }

    // Check for missing metadata
    const signalsWithoutMetadata = await prisma.signal.count({
      where: { metadata: { equals: Prisma.JsonNull } },
    });

    if (signalsWithoutMetadata > 0) {
      console.log(`🟡 MEDIUM: ${signalsWithoutMetadata} signals without metadata (${((signalsWithoutMetadata / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Missing metadata limits context and debugging capabilities.\n');
    }

    // Check for pending signals (not analyzed)
    const pendingSignals = await prisma.signal.count({
      where: { status: 'PENDING' },
    });

    if (pendingSignals > 0) {
      console.log(`🟠 HIGH: ${pendingSignals} signals stuck in PENDING status (${((pendingSignals / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Signals not being processed by the analysis pipeline.\n');
    }

    // Check for failed signals
    const failedSignals = await prisma.signal.count({
      where: { status: 'FAILED' },
    });

    if (failedSignals > 0) {
      console.log(`🟠 HIGH: ${failedSignals} signals with FAILED status (${((failedSignals / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Failed analyses indicate pipeline errors or problematic content.\n');
    }

    // Check for low quality signals
    const lowQualitySignals = await prisma.signal.count({
      where: { status: 'LOW_QUALITY' },
    });

    if (lowQualitySignals > 0) {
      console.log(`🟡 MEDIUM: ${lowQualitySignals} signals marked as LOW_QUALITY (${((lowQualitySignals / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Low-quality content filtered by quality gate.\n');
    }

    // Check for non-English signals
    const nonEnglishSignals = await prisma.signal.count({
      where: { status: 'NON_ENGLISH' },
    });

    if (nonEnglishSignals > 0) {
      console.log(`🟡 MEDIUM: ${nonEnglishSignals} signals marked as NON_ENGLISH (${((nonEnglishSignals / totalSignals) * 100).toFixed(1)}%)`);
      console.log('   Non-English signals excluded from analysis.\n');
    }

    // ─── 3. Analysis Coverage ───────────────────────────────────────────────
    console.log('📈 Analysis Coverage:');

    const signalsWithAnalysis = await prisma.signal.count({
      where: { analyses: { some: {} } },
    });

    const analysisCoverage = ((signalsWithAnalysis / totalSignals) * 100).toFixed(1);
    console.log(`   Signals with analysis: ${signalsWithAnalysis.toLocaleString()} (${analysisCoverage}%)`);

    // Check for dual-agent coverage by sampling
    const sampleAnalyses = await prisma.analysis.findMany({
      take: 1000,
      select: {
        signalId: true,
        agentPersona: true,
      },
    });

    const signalPersonas = new Map<string, Set<string>>();
    sampleAnalyses.forEach((a) => {
      if (!signalPersonas.has(a.signalId)) {
        signalPersonas.set(a.signalId, new Set());
      }
      signalPersonas.get(a.signalId)!.add(a.agentPersona);
    });

    let dualAgentCount = 0;
    signalPersonas.forEach((personas) => {
      if (personas.has('ANALYST') && personas.has('GOSSIP_GIRL')) {
        dualAgentCount++;
      }
    });

    const dualAgentCoverage = ((dualAgentCount / totalSignals) * 100).toFixed(1);
    console.log(`   Signals with dual-agent analysis (sample): ${dualAgentCount} (${dualAgentCoverage}%)`);
    console.log('');

    // ─── 4. Source Type Distribution ────────────────────────────────────────
    console.log('📈 Source Type Distribution:');
    const sourceTypeDistribution = await prisma.signal.groupBy({
      by: ['sourceType'],
      _count: true,
      orderBy: {
        _count: { sourceType: 'desc' },
      },
    });

    sourceTypeDistribution.forEach((s) => {
      const percentage = ((s._count / totalSignals) * 100).toFixed(1);
      console.log(`   ${s.sourceType}: ${s._count.toLocaleString()} (${percentage}%)`);
    });
    console.log('');

    // ─── 5. Sentiment Distribution ──────────────────────────────────────────
    console.log('📈 Sentiment Distribution (from analyses):');
    const sentimentDistribution = await prisma.analysis.groupBy({
      by: ['sentiment'],
      _count: true,
      orderBy: {
        _count: { sentiment: 'desc' },
      },
    });

    sentimentDistribution.forEach((s) => {
      const percentage = ((s._count / totalAnalyses) * 100).toFixed(1);
      console.log(`   ${s.sentiment}: ${s._count.toLocaleString()} (${percentage}%)`);
    });
    console.log('');

    // ─── 6. Content Quality Metrics ─────────────────────────────────────────
    console.log('📈 Content Quality:');

    // Get a sample of signals to analyze content length
    const sampleSignals = await prisma.signal.findMany({
      take: 100,
      select: {
        id: true,
        rawContent: true,
        title: true,
        sourceType: true,
      },
    });

    if (sampleSignals.length > 0) {
      const contentLengths = sampleSignals
        .filter((s) => s.rawContent)
        .map((s) => s.rawContent!.length);

      const avgLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length;
      const minLength = Math.min(...contentLengths);
      const maxLength = Math.max(...contentLengths);

      console.log(`   Average content length: ${avgLength.toFixed(0)} characters`);
      console.log(`   Min content length: ${minLength} characters`);
      console.log(`   Max content length: ${maxLength} characters`);

      const veryShort = contentLengths.filter((l) => l < 100).length;
      if (veryShort > 0) {
        console.log(`   ⚠️  ${veryShort} signals with very short content (<100 chars) in sample\n`);
      }
    }

    // ─── 7. Company Association ─────────────────────────────────────────────
    console.log('📈 Company Coverage:');

    const companiesWithSignals = await prisma.company.count({
      where: { signals: { some: {} } },
    });

    const companiesWithoutSignals = totalCompanies - companiesWithSignals;

    console.log(`   Companies with signals: ${companiesWithSignals.toLocaleString()}`);
    console.log(`   Companies without signals: ${companiesWithoutSignals.toLocaleString()}`);

    if (companiesWithoutSignals > 0) {
      console.log(`   ⚠️  ${companiesWithoutSignals} companies have no signals collected yet\n`);
    }

    // ─── 8. Data Origin ─────────────────────────────────────────────────────
    console.log('📈 Data Origin:');
    const dataOriginDistribution = await prisma.signal.groupBy({
      by: ['dataOrigin'],
      _count: true,
    });

    dataOriginDistribution.forEach((d) => {
      const percentage = ((d._count / totalSignals) * 100).toFixed(1);
      console.log(`   ${d.dataOrigin}: ${d._count.toLocaleString()} (${percentage}%)`);
    });
    console.log('');

    // ─── 9. Scraping Provenance ─────────────────────────────────────────────
    console.log('📈 Scraping Provenance:');

    const signalsWithScraper = await prisma.signal.count({
      where: { scraperName: { not: { equals: null } } },
    });

    console.log(`   Signals with scraper name: ${signalsWithScraper.toLocaleString()} (${((signalsWithScraper / totalSignals) * 100).toFixed(1)}%)`);

    const signalsWithMultipleAttempts = await prisma.signal.count({
      where: { scrapeAttempts: { gt: 1 } },
    });

    if (signalsWithMultipleAttempts > 0) {
      console.log(`   ⚠️  ${signalsWithMultipleAttempts} signals required multiple scrape attempts\n`);
    }

    // ─── 10. Temporal Analysis ──────────────────────────────────────────────
    console.log('📈 Temporal Analysis:');

    const dateRange = await prisma.signal.aggregate({
      _min: { publishedAt: true, scrapedAt: true },
      _max: { publishedAt: true, scrapedAt: true },
    });

    console.log(`   Earliest published signal: ${dateRange._min.publishedAt || 'N/A'}`);
    console.log(`   Latest published signal: ${dateRange._max.publishedAt || 'N/A'}`);
    console.log(`   Earliest scraped signal: ${dateRange._min.scrapedAt || 'N/A'}`);
    console.log(`   Latest scraped signal: ${dateRange._max.scrapedAt || 'N/A'}`);

    // Check for future dates
    const futureSignals = await prisma.signal.count({
      where: { publishedAt: { gt: new Date() } },
    });

    if (futureSignals > 0) {
      console.log(`   ⚠️  ${futureSignals} signals have publication dates in the future\n`);
    }

    console.log('═'.repeat(80));
    console.log('\n📋 KEY FINDINGS & RECOMMENDATIONS:\n');

    // Generate recommendations based on findings
    const recommendations = [];

    if (emptyContentSignals > 0) {
      recommendations.push('1. Fix scraping pipeline to handle empty content - implement proper error handling and validation');
    }

    if (emptyTitleSignals > 0) {
      recommendations.push('2. Improve title extraction - add fallbacks and validation for missing titles');
    }

    if (signalsWithoutEmbeddings > 0) {
      recommendations.push('3. Implement mandatory embedding generation for all signals to enable semantic search');
    }

    if (pendingSignals > 0 || failedSignals > 0) {
      recommendations.push('4. Investigate analysis pipeline bottlenecks - add retry logic and better error handling');
    }

    if (dualAgentCoverage && parseFloat(dualAgentCoverage) < 50) {
      recommendations.push('5. Increase dual-agent coverage - ensure both Analyst and Gossip Girl analyze each signal');
    }

    if (companiesWithoutSignals > 0) {
      recommendations.push('6. Improve company discovery - some tracked companies have no data sources or scrapers are failing');
    }

    if (missingPublishedAt > totalSignals * 0.3) {
      recommendations.push('7. Improve date extraction - many signals lack publication dates');
    }

    if (recommendations.length > 0) {
      recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));
    } else {
      console.log('   ✅ No critical issues found. Data quality appears good.');
    }

    console.log('\n' + '═'.repeat(80) + '\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error analyzing signal data:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
