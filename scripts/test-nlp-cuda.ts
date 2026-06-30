/**
 * Live test for NLP CUDA acceleration.
 * 
 * Tests backend detection and runs inference on a small model.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  console.log("=== NLP CUDA Live Test ===\n");

  // 1. Check environment
  console.log("Environment:");
  console.log(`  NLP_DEVICE: ${process.env.NLP_DEVICE ?? "(not set, will auto-detect)"}`);
  console.log();

  // 2. Import NLP module (triggers backend detection)
  console.log("Loading NLP module...");
  const nlp = await import("../src/lib/nlp");
  
  // 3. Check detected backend
  const stats = nlp.getModelCacheStats();
  console.log(`\nDetected backend: ${stats.backend ?? "not yet loaded"}`);
  console.log(`Detected dtype: ${stats.dtype ?? "not yet loaded"}`);
  console.log();

  // 4. Test with a small model (language detection - fastest to load)
  console.log("Testing language detection (smallest model)...");
  const testText = "Apple Inc reported strong Q4 earnings with revenue growth of 15% year-over-year.";
  
  const startTime = Date.now();
  try {
    const result = await nlp.detectLanguageWithFallback(testText);
    const elapsed = Date.now() - startTime;
    console.log(`  Language: ${result.language} (confidence: ${result.confidence.toFixed(3)})`);
    console.log(`  Time: ${elapsed}ms`);
  } catch (err) {
    console.log(`  Error: ${err}`);
  }
  console.log();

  // 5. Check stats after first model load
  const statsAfter = nlp.getModelCacheStats();
  console.log("After first inference:");
  console.log(`  Backend: ${statsAfter.backend}`);
  console.log(`  Dtype: ${statsAfter.dtype}`);
  console.log(`  Cached models: ${statsAfter.cachedModels}`);
  console.log(`  Total accesses: ${statsAfter.totalAccessCount}`);
  console.log();

  // 6. Test sentiment classification (medium model - FinBERT)
  console.log("Testing sentiment classification (FinBERT - 110M params)...");
  const sentimentText = "The company announced record profits and expanded its dividend, signaling strong confidence in future growth.";
  
  const sentimentStart = Date.now();
  try {
    const result = await nlp.classifySentimentWithFallback(sentimentText);
    const elapsed = Date.now() - sentimentStart;
    console.log(`  Sentiment: ${result.sentiment} (confidence: ${result.confidence.toFixed(3)})`);
    console.log(`  Time: ${elapsed}ms`);
  } catch (err) {
    console.log(`  Error: ${err}`);
  }
  console.log();

  // 7. Final stats
  const finalStats = nlp.getModelCacheStats();
  console.log("Final stats:");
  console.log(`  Backend: ${finalStats.backend}`);
  console.log(`  Dtype: ${finalStats.dtype}`);
  console.log(`  Cached models: ${finalStats.cachedModels}`);
  console.log(`  Total accesses: ${finalStats.totalAccessCount}`);
  
  if (finalStats.models.length > 0) {
    console.log("\nLoaded models:");
    for (const model of finalStats.models) {
      console.log(`  - ${model.task}: ${model.model}`);
    }
  }

  console.log("\n=== Test Complete ===");
  
  // Summary
  if (finalStats.backend === "cuda") {
    console.log("✓ CUDA acceleration is active!");
  } else if (finalStats.backend === "dml") {
    console.log("✓ DirectML (Windows GPU) acceleration is active!");
  } else if (finalStats.backend === "webgpu") {
    console.log("✓ WebGPU acceleration is active!");
  } else {
    console.log("⚠ Running on CPU (no GPU detected or GPU backend unavailable)");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
