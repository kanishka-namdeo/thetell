/**
 * Pre-download NLP models for local inference.
 *
 * This script downloads all required Transformers.js models to the local cache,
 * so the first production request doesn't block on model loading.
 *
 * Usage:
 *   pnpm tsx scripts/preload-nlp-models.ts
 *
 * Models downloaded:
 *   - Xenova/finbert (sentiment classification, ONNX version)
 *   - Xenova/bert-base-NER (named entity recognition)
 *   - Xenova/all-MiniLM-L6-v2 (embeddings + keyphrases)
 *   - FastText WASM (language detection, loaded on-demand)
 *   - Xenova/bart-large-mnli (quality gate)
 */

import { pipeline, env } from "@huggingface/transformers";
import { logger } from "@/lib/logger";

// Configure for local caching
env.allowLocalModels = true;
env.allowRemoteModels = true;
// Only override default cacheDir if explicitly set
if (process.env.NLP_MODEL_CACHE_DIR) {
  env.cacheDir = process.env.NLP_MODEL_CACHE_DIR;
}

interface ModelSpec {
  task: string;
  model: string;
  description: string;
}

const MODELS: ModelSpec[] = [
  {
    task: "text-classification",
    model: "Xenova/finbert",
    description: "Sentiment classification (financial text, ONNX)",
  },
  {
    task: "token-classification",
    model: "Xenova/bert-base-NER",
    description: "Named entity recognition",
  },
  {
    task: "feature-extraction",
    model: "Xenova/all-MiniLM-L6-v2",
    description: "Text embeddings (384 dimensions)",
  },
  {
    task: "zero-shot-classification",
    model: "Xenova/bart-large-mnli",
    description: "Quality gate (zero-shot classification)",
  },
];

async function downloadModel(spec: ModelSpec): Promise<boolean> {
  const startTime = Date.now();
  console.log(`\n📦 Downloading ${spec.model}...`);
  console.log(`   Task: ${spec.task}`);
  console.log(`   Purpose: ${spec.description}`);

  try {
    const p = await pipeline(spec.task as any, spec.model, {
      device: "cpu",
      dtype: "q8",
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Success (${(elapsed / 1000).toFixed(1)}s)`);

    // Clean up
    if (p && typeof (p as any).dispose === "function") {
      (p as any).dispose();
    }

    return true;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Failed after ${(elapsed / 1000).toFixed(1)}s`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  console.log("🚀 NLP Model Pre-download Script");
  console.log("==================================\n");
  console.log(`Cache directory: ${env.cacheDir ?? "default (HuggingFace hub)"}`);
  console.log(`Models to download: ${MODELS.length}\n`);

  const results: Array<{ model: string; success: boolean }> = [];

  for (const spec of MODELS) {
    const success = await downloadModel(spec);
    results.push({ model: spec.model, success });
  }

  console.log("\n\n📊 Summary");
  console.log("========");

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.model}`);
  }

  console.log(`\nTotal: ${successful} succeeded, ${failed} failed`);

  if (failed > 0) {
    console.log("\n⚠️  Some models failed to download.");
    console.log("Check your internet connection and try again.");
    console.log("The application will still work, but will use LLM fallback for failed models.");
    process.exit(1);
  } else {
    console.log("\n✅ All models downloaded successfully!");
    console.log("The NLP pipeline is ready to use local models.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
