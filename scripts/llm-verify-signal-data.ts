#!/usr/bin/env tsx
/**
 * LLM-Based Signal Data Verification
 * Uses the dual-agent system (Analyst + Gossip Girl) to verify signal data quality
 * and identify issues that automated checks might miss.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as pg from 'pg';
import OpenAI from 'openai';

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
const OPENAI_API_KEY = envVars.API_KEY;
const BASE_URL = envVars.BASE_URL;
const MODEL = envVars.FAST_MODEL || 'qwen3-coder-next';

const url = new URL(DATABASE_URL);
const pool = new pg.Pool({
  host: url.hostname,
  port: parseInt(url.port),
  database: url.pathname.slice(1),
  user: url.username,
  password: url.password,
});

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: BASE_URL,
});

interface VerificationResult {
  signalId: string;
  title: string;
  sourceType: string;
  analystFindings: AnalystFinding;
  gossipGirlFindings: GossipGirlFinding;
  overallQualityScore: number;
  criticalIssues: string[];
  recommendations: string[];
}

interface AnalystFinding {
  contentQuality: number; // 1-10
  informationDensity: number; // 1-10
  factualConsistency: number; // 1-10
  strategicValue: number; // 1-10
  concerns: string[];
  summary: string;
}

interface GossipGirlFinding {
  subtextDetection: number; // 1-10
  hiddenPatterns: number; // 1-10
  narrativeCoherence: number; // 1-10
  entertainmentValue: number; // 1-10
  concerns: string[];
  summary: string;
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

async function verifyWithAnalyst(signal: any): Promise<AnalystFinding> {
  // Sanitize content for prompt
  const contentSample = signal.rawContent?.substring(0, 1000)?.replace(/"/g, '\\"')?.replace(/\n/g, ' ') || 'No content available';

  const prompt = `You are The Analyst - an authoritative, data-driven intelligence analyst in the style of Bloomberg Intelligence.

Your task is to verify the quality and accuracy of this signal data:

**Signal Details:**
- Title: ${signal.title}
- Source Type: ${signal.sourceType}
- Content Length: ${signal.content_length} characters
- Published: ${signal.publishedAt}
- Scraper: ${signal.scraperName}
- Data Origin: ${signal.dataOrigin}

**Content Sample (first 1000 chars):**
${contentSample}

**Verification Checklist:**
1. **Content Quality**: Is the content substantive and well-written? (1-10)
2. **Information Density**: Does it contain specific numbers, dates, named sources? (1-10)
3. **Factual Consistency**: Are there any contradictions or logical inconsistencies? (1-10)
4. **Strategic Value**: Does it reveal corporate strategy or intent? (1-10)

**Critical Issues to Detect:**
- Boilerplate or generic content
- Missing key information (who, what, when, where)
- Contradictory statements
- Lack of specific details
- Promotional or marketing language masquerading as news
- Outdated information presented as current

Provide your findings in JSON format with these exact keys:
{
  "contentQuality": <number 1-10>,
  "informationDensity": <number 1-10>,
  "factualConsistency": <number 1-10>,
  "strategicValue": <number 1-10>,
  "concerns": [<list of specific concerns as strings>],
  "summary": "<2-3 sentence summary of your assessment>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are The Analyst, a meticulous intelligence analyst who verifies signal data quality with a focus on factual accuracy, information density, and strategic value. You are skeptical, detail-oriented, and data-driven. Always respond with valid JSON only, no markdown formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    let responseText = completion.choices[0].message.content || '{}';

    // Extract JSON from markdown code blocks if present
    const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
    }

    const response = JSON.parse(responseText);
    return response as AnalystFinding;
  } catch (error) {
    console.error('Analyst verification error:', error);
    return {
      contentQuality: 0,
      informationDensity: 0,
      factualConsistency: 0,
      strategicValue: 0,
      concerns: ['LLM verification failed'],
      summary: 'Error during verification',
    };
  }
}

async function verifyWithGossipGirl(signal: any): Promise<GossipGirlFinding> {
  // Sanitize content for prompt
  const contentSample = signal.rawContent?.substring(0, 1000)?.replace(/"/g, '\\"')?.replace(/\n/g, ' ') || 'No content available';

  const prompt = `You are Gossip Girl - a sharp-witted, perceptive intelligence analyst who reads between the lines of corporate communications. You're like Page Six meets Wall Street Journal.

Your task is to verify this signal by looking for hidden meanings, subtext, and patterns that others might miss:

**Signal Details:**
- Title: ${signal.title}
- Source Type: ${signal.sourceType}
- Content Length: ${signal.content_length} characters
- Published: ${signal.publishedAt}
- Scraper: ${signal.scraperName}

**Content Sample (first 1000 chars):**
${contentSample}

**Verification Checklist:**
1. **Subtext Detection**: What's NOT being said? What's the real story? (1-10)
2. **Hidden Patterns**: Does this fit a larger narrative or pattern? (1-10)
3. **Narrative Coherence**: Does the story hold together? Any plot holes? (1-10)
4. **Entertainment Value**: Is this actually interesting or just noise? (1-10)

**Critical Issues to Detect:**
- Spin or PR language hiding bad news
- Executive behavior patterns (overcompensation, deflection)
- Timing suspicious (released on Friday afternoon?)
- What competitors aren't saying about this
- Whether this is signal or just noise

Provide your findings in JSON format with these exact keys:
{
  "subtextDetection": <number 1-10>,
  "hiddenPatterns": <number 1-10>,
  "narrativeCoherence": <number 1-10>,
  "entertainmentValue": <number 1-10>,
  "concerns": [<list of specific concerns as strings>],
  "summary": "<2-3 sentence summary of your assessment>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are Gossip Girl, a perceptive intelligence analyst who specializes in reading between the lines, detecting subtext, and finding hidden patterns in corporate communications. You are witty, skeptical, and always looking for the real story. Always respond with valid JSON only, no markdown formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    let responseText = completion.choices[0].message.content || '{}';

    // Extract JSON from markdown code blocks if present
    const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
    }

    const response = JSON.parse(responseText);
    return response as GossipGirlFinding;
  } catch (error) {
    console.error('Gossip Girl verification error:', error);
    return {
      subtextDetection: 0,
      hiddenPatterns: 0,
      narrativeCoherence: 0,
      entertainmentValue: 0,
      concerns: ['LLM verification failed'],
      summary: 'Error during verification',
    };
  }
}

async function generateSynthesis(analyst: AnalystFinding, gossip: GossipGirlFinding, signal: any): Promise<{ overallScore: number; criticalIssues: string[]; recommendations: string[] }> {
  const prompt = `Based on the dual-agent verification of this signal, synthesize the findings:

**Signal:** ${signal.title}

**Analyst Findings:**
- Content Quality: ${analyst.contentQuality}/10
- Information Density: ${analyst.informationDensity}/10
- Factual Consistency: ${analyst.factualConsistency}/10
- Strategic Value: ${analyst.strategicValue}/10
- Concerns: ${analyst.concerns.join(', ') || 'None'}
- Summary: ${analyst.summary}

**Gossip Girl Findings:**
- Subtext Detection: ${gossip.subtextDetection}/10
- Hidden Patterns: ${gossip.hiddenPatterns}/10
- Narrative Coherence: ${gossip.narrativeCoherence}/10
- Entertainment Value: ${gossip.entertainmentValue}/10
- Concerns: ${gossip.concerns.join(', ') || 'None'}
- Summary: ${gossip.summary}

Provide a synthesis in JSON format with these exact keys:
{
  "overallScore": <number 1-10>,
  "criticalIssues": [<list of critical issues that need attention as strings>],
  "recommendations": [<list of specific recommendations for improving this signal or similar signals as strings>]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a synthesis engine that combines analytical rigor with perceptive insights to provide actionable recommendations for signal data quality. Always respond with valid JSON only, no markdown formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
    });

    let responseText = completion.choices[0].message.content || '{}';

    // Extract JSON from markdown code blocks if present
    const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
    }

    const response = JSON.parse(responseText);
    return response as { overallScore: number; criticalIssues: string[]; recommendations: string[] };
  } catch (error) {
    console.error('Synthesis error:', error);
    return {
      overallScore: 0,
      criticalIssues: ['Synthesis failed'],
      recommendations: ['Manual review required'],
    };
  }
}

async function llmVerifySignalData() {
  console.log('🔍 LLM-Based Signal Data Verification\n');
  console.log('═'.repeat(80));

  try {
    // Get a sample of signals to verify (limit to 5 for demo purposes)
    const signals = await runQuery(`
      SELECT
        s.id,
        s.title,
        s."sourceType",
        s."rawContent",
        s."publishedAt",
        s."scrapedAt",
        s."scraperName",
        s."dataOrigin",
        LENGTH(s."rawContent") as content_length,
        c.name as company_name
      FROM "Signal" s
      JOIN "Company" c ON c.id = s."companyId"
      ORDER BY s."scrapedAt" DESC
      LIMIT 5
    `);

    console.log(`📊 Verifying ${signals.length} signals with dual-agent system...\n`);

    const results: VerificationResult[] = [];

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      console.log(`\n📝 Verifying Signal ${i + 1}/${signals.length}: ${signal.title}`);
      console.log('─'.repeat(80));

      // Run dual-agent verification
      console.log('   🤖 Analyst verifying...');
      const analystFindings = await verifyWithAnalyst(signal);

      console.log('   🤖 Gossip Girl verifying...');
      const gossipGirlFindings = await verifyWithGossipGirl(signal);

      console.log('   🤖 Synthesizing findings...');
      const synthesis = await generateSynthesis(analystFindings, gossipGirlFindings, signal);

      const result: VerificationResult = {
        signalId: signal.id,
        title: signal.title,
        sourceType: signal.sourceType,
        analystFindings,
        gossipGirlFindings,
        overallQualityScore: synthesis.overallScore,
        criticalIssues: synthesis.criticalIssues,
        recommendations: synthesis.recommendations,
      };

      results.push(result);

      // Print summary
      console.log(`   📊 Overall Quality Score: ${synthesis.overallScore}/10`);
      if (synthesis.criticalIssues.length > 0) {
        console.log(`   ⚠️  Critical Issues: ${synthesis.criticalIssues.length}`);
        synthesis.criticalIssues.forEach((issue) => console.log(`      • ${issue}`));
      }
      if (synthesis.recommendations.length > 0) {
        console.log(`   💡 Recommendations: ${synthesis.recommendations.length}`);
        synthesis.recommendations.forEach((rec) => console.log(`      • ${rec}`));
      }
    }

    // ─── Summary Report ─────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(80));
    console.log('\n📋 LLM VERIFICATION SUMMARY:\n');

    const avgScore = results.reduce((sum, r) => sum + r.overallQualityScore, 0) / results.length;
    console.log(`   Average Quality Score: ${avgScore.toFixed(1)}/10`);

    const highQuality = results.filter((r) => r.overallQualityScore >= 8).length;
    const mediumQuality = results.filter((r) => r.overallQualityScore >= 5 && r.overallQualityScore < 8).length;
    const lowQuality = results.filter((r) => r.overallQualityScore < 5).length;

    console.log(`   High Quality (8-10): ${highQuality} signals`);
    console.log(`   Medium Quality (5-7): ${mediumQuality} signals`);
    console.log(`   Low Quality (1-4): ${lowQuality} signals`);

    // Aggregate critical issues
    const allCriticalIssues = results.flatMap((r) => r.criticalIssues);
    const issueCounts = allCriticalIssues.reduce((acc, issue) => {
      acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (Object.keys(issueCounts).length > 0) {
      console.log('\n   🔴 Most Common Critical Issues:');
      Object.entries(issueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([issue, count]) => {
          console.log(`      • ${issue} (${count} signals)`);
        });
    }

    // Aggregate recommendations
    const allRecommendations = results.flatMap((r) => r.recommendations);
    const uniqueRecommendations = [...new Set(allRecommendations)];

    if (uniqueRecommendations.length > 0) {
      console.log('\n   💡 Top Recommendations:');
      uniqueRecommendations.slice(0, 10).forEach((rec, idx) => {
        console.log(`      ${idx + 1}. ${rec}`);
      });
    }

    // ─── Detailed Findings ──────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(80));
    console.log('\n📝 DETAILED FINDINGS:\n');

    results.forEach((result, idx) => {
      console.log(`${idx + 1}. ${result.title}`);
      console.log(`   Type: ${result.sourceType} | Score: ${result.overallQualityScore}/10`);
      console.log(`   Analyst: Q=${result.analystFindings.contentQuality}, I=${result.analystFindings.informationDensity}, F=${result.analystFindings.factualConsistency}, S=${result.analystFindings.strategicValue}`);
      console.log(`   Gossip:  Sub=${result.gossipGirlFindings.subtextDetection}, Pat=${result.gossipGirlFindings.hiddenPatterns}, Nar=${result.gossipGirlFindings.narrativeCoherence}, Ent=${result.gossipGirlFindings.entertainmentValue}`);

      if (result.criticalIssues.length > 0) {
        console.log('   Critical Issues:');
        result.criticalIssues.forEach((issue) => console.log(`     ⚠️  ${issue}`));
      }

      if (result.recommendations.length > 0) {
        console.log('   Recommendations:');
        result.recommendations.forEach((rec) => console.log(`     💡 ${rec}`));
      }

      console.log('');
    });

    console.log('═'.repeat(80) + '\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

llmVerifySignalData();
