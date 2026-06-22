/**
 * Pre-download all NLP models to the local cache.
 *
 * Usage:
 *   pnpm dlx tsx scripts/download-nlp-models.ts
 *
 * This script downloads all required NLP models so they are available
 * locally without network access. Useful for Docker builds and CI.
 *
 * Models downloaded:
 * - Xenova/fasttext-language-identification
 * - ProsusAI/finbert
 * - Xenova/bert-base-NER
 * - Xenova/all-MiniLM-L6-v2
 * - Xenova/bart-large-mnli
 */

import { pipeline } from "@huggingface/transformers";

const MODELS = [
  { task: "text-classification" as const, model: "Xenova/fasttext-language-identification" },
  { task: "text-classification" as const, model: "ProsusAI/finbert" },
  { task: "token-classification" as const, model: "Xenova/bert-base-NER" },
  { task: "feature-extraction" as const, model: "Xenova/all-MiniLM-L6-v2" },
  { task: "zero-shot-classification" as const, model: "Xenova/bart-large-mnli" },
];

async function main() {
  console.log("Starting NLP model pre-download...\n");

  let successCount = 0;
  let failCount = 0;

  for (const { task, model } of MODELS) {
    const start = Date.now();
    process.stdout.write(`Downloading ${model}...`);
    try {
      await pipeline(task, model);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(` done (${elapsed}s)`);
      successCount++;
    } catch (err) {
      console.log(` FAILED: ${String(err)}`);
      failCount++;
    }
  }

  console.log(`\nComplete: ${successCount} succeeded, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
