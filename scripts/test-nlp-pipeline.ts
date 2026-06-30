/**
 * End-to-end test of all NLP pipeline capabilities.
 *
 * Exercises every local model with realistic sample text
 * and reports results + timing for each.
 *
 * Usage:
 *   pnpm tsx scripts/test-nlp-pipeline.ts
 */

import {
  detectLanguage,
  classifySentimentLocal,
  assessContentQuality,
  extractEntities,
  generateEmbedding,
  extractKeyPhrases,
  cosineSimilarity,
} from "@/lib/nlp";

const SAMPLE_TEXT = `
Apple Inc. reported strong Q3 2026 earnings on July 23, 2026, with revenue reaching $94.8 billion,
beating analyst estimates of $91.2 billion. CEO Tim Cook announced a new $110 billion share
buyback program and raised the quarterly dividend to $0.26 per share. The iPhone segment saw
revenue growth of 12% year-over-year, driven by strong demand in China and India. Services
revenue hit a record $25.5 billion, up 14% from last year. CFO Luca Maestri noted that gross
margins expanded to 46.3%, benefiting from a favorable product mix and cost efficiencies.
The company also announced plans to invest $500 million in a new AI research center in Austin, Texas.
`;

const COMPANY_NAME = "Apple";

interface TestResult {
  name: string;
  status: "PASS" | "FAIL";
  elapsedMs: number;
  summary: string;
  details?: unknown;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, elapsedMs: Date.now() - start };
}

async function main() {
  console.log("🧪 NLP Pipeline Test Suite");
  console.log("==========================\n");
  console.log(`Sample text (${SAMPLE_TEXT.trim().length} chars):\n`);
  console.log(SAMPLE_TEXT.trim().slice(0, 200) + "...\n");

  const results: TestResult[] = [];

  // 1. Language Detection
  console.log("─".repeat(50));
  console.log("1️⃣  Language Detection");
  try {
    const { result, elapsedMs } = await timed(() => detectLanguage(SAMPLE_TEXT));
    const status = result.language === "en" && result.confidence > 0.9 ? "PASS" : "FAIL";
    console.log(`   Language: ${result.language} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
    console.log(`   ${status} (${elapsedMs}ms)\n`);
    results.push({ name: "Language Detection", status, elapsedMs, summary: `${result.language} @ ${(result.confidence * 100).toFixed(1)}%`, details: result });
  } catch (err) {
    console.log(`   ❌ FAIL — ${err instanceof Error ? err.message : String(err)}\n`);
    results.push({ name: "Language Detection", status: "FAIL", elapsedMs: 0, summary: String(err) });
  }

  // 2. Sentiment Classification (FinBERT)
  console.log("─".repeat(50));
  console.log("2️⃣  Sentiment Classification (FinBERT)");
  try {
    const { result, elapsedMs } = await timed(() => classifySentimentLocal(SAMPLE_TEXT));
    const status = ["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(result.sentiment) ? "PASS" : "FAIL";
    console.log(`   Sentiment: ${result.sentiment} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
    console.log(`   ${status} (${elapsedMs}ms)\n`);
    results.push({ name: "Sentiment (FinBERT)", status, elapsedMs, summary: `${result.sentiment} @ ${(result.confidence * 100).toFixed(1)}%`, details: result });
  } catch (err) {
    console.log(`   ❌ FAIL — ${err instanceof Error ? err.message : String(err)}\n`);
    results.push({ name: "Sentiment (FinBERT)", status: "FAIL", elapsedMs: 0, summary: String(err) });
  }

  // 3. Quality Gate (Zero-shot classification)
  console.log("─".repeat(50));
  console.log("3️⃣  Quality Gate (BART-large-mnli)");
  try {
    const { result, elapsedMs } = await timed(() => assessContentQuality(SAMPLE_TEXT, COMPANY_NAME));
    const status = result.pass ? "PASS" : "FAIL";
    console.log(`   Score: ${result.score.toFixed(3)} | Pass: ${result.pass}`);
    console.log(`   Reasons: ${result.reasons.join(", ")}`);
    console.log(`   ${status} (${elapsedMs}ms)\n`);
    results.push({ name: "Quality Gate", status, elapsedMs, summary: `score=${result.score.toFixed(3)} pass=${result.pass}`, details: result });
  } catch (err) {
    console.log(`   ❌ FAIL — ${err instanceof Error ? err.message : String(err)}\n`);
    results.push({ name: "Quality Gate", status: "FAIL", elapsedMs: 0, summary: String(err) });
  }

  // 4. Named Entity Recognition (BERT-NER)
  console.log("─".repeat(50));
  console.log("4️⃣  Named Entity Recognition (BERT-NER)");
  try {
    const { result, elapsedMs } = await timed(() => extractEntities(SAMPLE_TEXT));
    const totalEntities = result.persons.length + result.organizations.length + result.locations.length + result.dates.length + result.monetary.length;
    const status = totalEntities > 0 ? "PASS" : "FAIL";
    console.log(`   Persons: ${result.persons.join(", ") || "(none)"}`);
    console.log(`   Organizations: ${result.organizations.join(", ") || "(none)"}`);
    console.log(`   Locations: ${result.locations.join(", ") || "(none)"}`);
    console.log(`   Dates: ${result.dates.join(", ") || "(none)"}`);
    console.log(`   Monetary: ${result.monetary.join(", ") || "(none)"}`);
    console.log(`   ${status} — ${totalEntities} entities (${elapsedMs}ms)\n`);
    results.push({ name: "Entity Recognition", status, elapsedMs, summary: `${totalEntities} entities`, details: result });
  } catch (err) {
    console.log(`   ❌ FAIL — ${err instanceof Error ? err.message : String(err)}\n`);
    results.push({ name: "Entity Recognition", status: "FAIL", elapsedMs: 0, summary: String(err) });
  }

  // 5. Text Embeddings (all-MiniLM-L6-v2)
  console.log("─".repeat(50));
  console.log("5️⃣  Text Embeddings (all-MiniLM-L6-v2)");
  try {
    const { result, elapsedMs } = await timed(() => generateEmbedding(SAMPLE_TEXT));
    const status = result.length === 384 ? "PASS" : "FAIL";
    console.log(`   Dimensions: ${result.length}`);
    console.log(`   First 5 values: [${result.slice(0, 5).map(v => v.toFixed(4)).join(", ")}]`);
    console.log(`   ${status} (${elapsedMs}ms)\n`);
    results.push({ name: "Embeddings", status, elapsedMs, summary: `${result.length}d vector`, details: { dimensions: result.length, sample: result.slice(0, 5) } });

    // Test cosine similarity with a different text
    const similarText = "Apple reported great earnings with strong revenue growth.";
    const differentText = "The weather forecast predicts rain in London tomorrow.";
    const simEmbedding = await generateEmbedding(similarText);
    const diffEmbedding = await generateEmbedding(differentText);
    const simScore = cosineSimilarity(result, simEmbedding);
    const diffScore = cosineSimilarity(result, diffEmbedding);
    console.log(`   Cosine similarity (similar text): ${simScore.toFixed(4)}`);
    console.log(`   Cosine similarity (different text): ${diffScore.toFixed(4)}`);
    console.log(`   Similar > Different: ${simScore > diffScore ? "✅" : "❌"}\n`);
  } catch (err) {
    console.log(`   ❌ FAIL — ${err instanceof Error ? err.message : String(err)}\n`);
    results.push({ name: "Embeddings", status: "FAIL", elapsedMs: 0, summary: String(err) });
  }

  // 6. Key Phrase Extraction
  console.log("─".repeat(50));
  console.log("6️⃣  Key Phrase Extraction (KeyBERT-style)");
  try {
    const { result, elapsedMs } = await timed(() => extractKeyPhrases(SAMPLE_TEXT));
    const status = result.length > 0 ? "PASS" : "FAIL";
    console.log(`   Top key phrases:`);
    for (const kp of result) {
      console.log(`     • "${kp.phrase}" (score: ${kp.score.toFixed(4)})`);
    }
    console.log(`   ${status} — ${result.length} phrases (${elapsedMs}ms)\n`);
    results.push({ name: "Key Phrases", status, elapsedMs, summary: `${result.length} phrases`, details: result });
  } catch (err) {
    console.log(`   ❌ FAIL — ${err instanceof Error ? err.message : String(err)}\n`);
    results.push({ name: "Key Phrases", status: "FAIL", elapsedMs: 0, summary: String(err) });
  }

  // Summary
  console.log("\n" + "═".repeat(50));
  console.log("📊 Summary");
  console.log("═".repeat(50));

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const totalElapsed = results.reduce((sum, r) => sum + r.elapsedMs, 0);

  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : "❌";
    console.log(`${icon} ${r.name.padEnd(25)} ${r.elapsedMs.toString().padStart(6)}ms  ${r.summary}`);
  }

  console.log(`\nTotal: ${passed}/${results.length} passed, ${failed} failed (${totalElapsed}ms)`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ All NLP pipeline tests passed!");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
