/**
 * Integration test for the NLP pipeline
 * Tests the full flow: language detection -> quality gate -> sentiment -> entities -> embeddings -> keyphrases
 * Uses direct module imports to bypass HTTP auth layer
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Import NLP modules directly
import { detectLanguage, LANGUAGE_CONFIDENCE_THRESHOLD } from '../src/lib/nlp/language-detector';
import { assessContentQuality } from '../src/lib/nlp/quality-gate';
import { classifySentimentLocal } from '../src/lib/nlp/sentiment-classifier';
import { extractEntities } from '../src/lib/nlp/entity-extractor';
import { generateEmbedding } from '../src/lib/nlp/embedding-generator';
import { extractKeyPhrases } from '../src/lib/nlp/keyphrase-extractor';

const TEST_CONTENT = `Apple Inc. reported strong Q3 2026 earnings on July 23, 2026, with revenue reaching $94.8 billion,
beating analyst estimates of $91.2 billion. CEO Tim Cook announced a new $110 billion share
buyback program and raised the quarterly dividend to $0.26 per share. The iPhone segment saw
revenue growth of 12% year-over-year, driven by strong demand in China and India. Services
revenue hit a record $25.5 billion, up 14% from last year. CFO Luca Maestri noted that gross
margins expanded to 46.3%, benefiting from a favorable product mix and cost efficiencies.
The company also announced plans to invest $500 million in a new AI research center in Austin, Texas.`;

const COMPANY_NAME = 'Apple';

async function testLanguageDetection() {
  console.log('1️⃣  Testing Language Detection...');
  const start = Date.now();
  const result = await detectLanguage(TEST_CONTENT);
  const elapsed = Date.now() - start;
  
  console.log(`   Language: ${result.language} (${(result.confidence * 100).toFixed(1)}%)`);
  console.log(`   Threshold: ${(LANGUAGE_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`   Passes threshold: ${result.confidence >= LANGUAGE_CONFIDENCE_THRESHOLD ? '✅' : '❌'}`);
  console.log(`   Time: ${elapsed}ms\n`);
  
  return {
    pass: result.language === 'en' && result.confidence >= LANGUAGE_CONFIDENCE_THRESHOLD,
    result,
    elapsed,
  };
}

async function testQualityGate() {
  console.log('2️⃣  Testing Quality Gate...');
  const start = Date.now();
  const result = await assessContentQuality(TEST_CONTENT, COMPANY_NAME);
  const elapsed = Date.now() - start;
  
  console.log(`   Score: ${result.score.toFixed(3)}`);
  console.log(`   Pass: ${result.pass ? '✅' : '❌'}`);
  console.log(`   Reasons: ${result.reasons.join(', ')}`);
  console.log(`   Time: ${elapsed}ms\n`);
  
  return { pass: result.pass, result, elapsed };
}

async function testSentiment() {
  console.log('3️⃣  Testing Sentiment Classification...');
  const start = Date.now();
  const result = await classifySentimentLocal(TEST_CONTENT);
  const elapsed = Date.now() - start;
  
  console.log(`   Sentiment: ${result.sentiment}`);
  console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`   Time: ${elapsed}ms\n`);
  
  return { pass: !!result.sentiment, result, elapsed };
}

async function testEntityExtraction() {
  console.log('4️⃣  Testing Entity Extraction...');
  const start = Date.now();
  const result = await extractEntities(TEST_CONTENT);
  const elapsed = Date.now() - start;
  
  const totalEntities = result.persons.length + result.organizations.length + 
    result.locations.length + result.dates.length + result.monetary.length;
  
  console.log(`   Persons: ${result.persons.join(', ') || '(none)'}`);
  console.log(`   Organizations: ${result.organizations.join(', ') || '(none)'}`);
  console.log(`   Locations: ${result.locations.join(', ') || '(none)'}`);
  console.log(`   Dates: ${result.dates.join(', ') || '(none)'}`);
  console.log(`   Monetary: ${result.monetary.length} values`);
  console.log(`   Total: ${totalEntities} entities`);
  console.log(`   Time: ${elapsed}ms\n`);
  
  return { pass: totalEntities > 0, result, elapsed };
}

async function testEmbeddings() {
  console.log('5️⃣  Testing Embedding Generation...');
  const start = Date.now();
  const embedding = await generateEmbedding(TEST_CONTENT);
  const elapsed = Date.now() - start;
  
  console.log(`   Dimensions: ${embedding.length}`);
  console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
  console.log(`   Time: ${elapsed}ms\n`);
  
  return { pass: embedding.length === 384, result: embedding, elapsed };
}

async function testKeyPhrases() {
  console.log('6️⃣  Testing Key Phrase Extraction...');
  const start = Date.now();
  const phrases = await extractKeyPhrases(TEST_CONTENT);
  const elapsed = Date.now() - start;
  
  console.log(`   Top phrases:`);
  phrases.forEach((p, i) => {
    console.log(`     ${i + 1}. "${p.phrase}" (score: ${p.score.toFixed(3)})`);
  });
  console.log(`   Time: ${elapsed}ms\n`);
  
  return { pass: phrases.length > 0, result: phrases, elapsed };
}

async function testDatabaseIntegration() {
  console.log('7️⃣  Testing Database Integration...');
  
  // Check if we can connect and query
  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  });
  
  if (!company) {
    console.log('   ❌ No companies found in database\n');
    return { pass: false, elapsed: 0 };
  }
  
  console.log(`   Company: ${company.name} (${company.id})`);
  
  // Check existing signals
  const signalCount = await prisma.signal.count();
  console.log(`   Existing signals: ${signalCount}`);
  
  // Check NLP-related results in existing analyzed signals
  const recentSignal = await prisma.signal.findFirst({
    where: { status: 'ANALYZED' },
    select: {
      id: true,
      title: true,
      status: true,
      metadata: true,
      analyses: {
        take: 1,
        select: {
          sentiment: true,
          confidence: true,
          summary: true,
          agentPersona: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  if (recentSignal) {
    console.log(`   Recent analyzed signal: "${recentSignal.title?.substring(0, 60)}..."`);
    console.log(`   Status: ${recentSignal.status}`);
    
    const meta = recentSignal.metadata as Record<string, any> | null;
    if (meta) {
      console.log(`   Metadata language: ${meta?.language || 'not stored'}`);
      console.log(`   Metadata quality: ${meta?.qualityScore || 'not stored'}`);
    }
    
    if (recentSignal.analyses.length > 0) {
      const analysis = recentSignal.analyses[0];
      console.log(`   Analysis sentiment: ${analysis.sentiment} (confidence: ${analysis.confidence.toFixed(2)})`);
      console.log(`   Analysis persona: ${analysis.agentPersona}`);
      console.log(`   Summary: ${analysis.summary?.substring(0, 80)}...`);
    }
  } else {
    console.log('   No analyzed signals found yet.');
  }
  
  console.log('   ✅ Database connection working\n');
  
  return { pass: true, elapsed: 0 };
}

async function main() {
  try {
    console.log('🚀 NLP Pipeline Integration Test\n');
    console.log(`Content: ${TEST_CONTENT.substring(0, 80)}...\n`);
    console.log('─'.repeat(50) + '\n');
    
    const results: Array<{ name: string; pass: boolean; elapsed: number }> = [];
    
    // Test each NLP component
    const langResult = await testLanguageDetection();
    results.push({ name: 'Language Detection', pass: langResult.pass, elapsed: langResult.elapsed });
    
    const qualityResult = await testQualityGate();
    results.push({ name: 'Quality Gate', pass: qualityResult.pass, elapsed: qualityResult.elapsed });
    
    const sentimentResult = await testSentiment();
    results.push({ name: 'Sentiment', pass: sentimentResult.pass, elapsed: sentimentResult.elapsed });
    
    const entityResult = await testEntityExtraction();
    results.push({ name: 'Entity Extraction', pass: entityResult.pass, elapsed: entityResult.elapsed });
    
    const embeddingResult = await testEmbeddings();
    results.push({ name: 'Embeddings', pass: embeddingResult.pass, elapsed: embeddingResult.elapsed });
    
    const keyphraseResult = await testKeyPhrases();
    results.push({ name: 'Key Phrases', pass: keyphraseResult.pass, elapsed: keyphraseResult.elapsed });
    
    // Test database
    const dbResult = await testDatabaseIntegration();
    results.push({ name: 'Database', pass: dbResult.pass, elapsed: dbResult.elapsed });
    
    // Summary
    console.log('─'.repeat(50));
    console.log('\n📊 Summary:\n');
    
    const totalElapsed = results.reduce((sum, r) => sum + r.elapsed, 0);
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    
    results.forEach(r => {
      console.log(`   ${r.pass ? '✅' : '❌'} ${r.name.padEnd(25)} ${r.elapsed > 0 ? `${r.elapsed}ms` : ''}`);
    });
    
    console.log(`\n   Total: ${passed}/${results.length} passed, ${failed} failed (${totalElapsed}ms)`);
    
    if (failed === 0) {
      console.log('\n🎉 All pipeline tests passed!');
    } else {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
