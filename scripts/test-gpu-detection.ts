/**
 * Test GPU backend detection for NLP pipeline.
 * Verifies that the system correctly identifies available GPU backends.
 */

import { listSupportedBackends } from "onnxruntime-node";

async function main() {
  console.log("🚀 Testing NLP GPU backend detection...\n");

  // 1. Check available backends via onnxruntime-node
  console.log("Step 1: Querying onnxruntime-node for supported backends...");
  const backends = listSupportedBackends();
  console.log("Available backends:");
  backends.forEach(b => {
    console.log(`  - ${b.name} (${b.bundled ? 'bundled' : 'optional'})`);
  });
  console.log();

  const hasDml = backends.some(b => b.name === "dml");
  const hasCuda = backends.some(b => b.name === "cuda");
  const hasWebgpu = backends.some(b => b.name === "webgpu");

  console.log(`✓ CUDA support: ${hasCuda ? "YES" : "NO"}`);
  console.log(`✓ DirectML support: ${hasDml ? "YES" : "NO"}`);
  console.log(`✓ WebGPU support: ${hasWebgpu ? "YES" : "NO"}\n`);

  // 2. Determine what the NLP pipeline will use
  console.log("Step 2: Determining NLP pipeline routing...");
  let activeBackend = "cpu";
  let dtype = "q8";

  if (hasCuda) {
    activeBackend = "cuda";
    dtype = "fp32";
    console.log("✓ Active backend: CUDA (NVIDIA GPU on Linux)");
  } else if (hasDml) {
    activeBackend = "dml";
    dtype = "fp32";
    console.log("✓ Active backend: DirectML (Windows GPU)");
  } else if (hasWebgpu) {
    activeBackend = "webgpu";
    dtype = "fp32";
    console.log("✓ Active backend: WebGPU");
  } else {
    console.log("✓ Active backend: CPU (no GPU detected)");
  }

  console.log(`✓ Dtype: ${dtype}\n`);

  // 3. Environment check
  console.log("Step 3: Environment configuration...");
  console.log(`NLP_DEVICE: ${process.env.NLP_DEVICE || "not set (auto-detect)"}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Node.js: ${process.version}\n`);

  // 4. Summary
  console.log("=".repeat(60));
  console.log("GPU Acceleration Status");
  console.log("=".repeat(60));

  if (activeBackend === "dml") {
    console.log("✅ DirectML acceleration is ACTIVE");
    console.log("   All NLP models will run on your Windows GPU");
    console.log("   Expected performance: 10-50x faster than CPU");
  } else if (activeBackend === "cuda") {
    console.log("✅ CUDA acceleration is ACTIVE");
    console.log("   All NLP models will run on your NVIDIA GPU");
    console.log("   Expected performance: 20-100x faster than CPU");
  } else if (activeBackend === "webgpu") {
    console.log("✅ WebGPU acceleration is ACTIVE");
    console.log("   All NLP models will run on your GPU via WebGPU");
  } else {
    console.log("⚠️  Running on CPU (no GPU backend available)");
    console.log("   To enable GPU acceleration:");
    console.log("   - Windows: DirectML should be available (check onnxruntime-node)");
    console.log("   - Linux NVIDIA: Install CUDA 12 and set NLP_DEVICE=cuda");
  }

  console.log("=".repeat(60));
  console.log();

  // 5. Test the actual detection logic from model-cache.ts
  console.log("Step 4: Testing model-cache.ts detection logic...");
  const { getBackend } = await import("../src/lib/nlp/model-cache");
  const detectedBackend = await getBackend();
  console.log(`✓ getBackend() returned: ${detectedBackend}`);

  if (detectedBackend === activeBackend) {
    console.log("✅ Detection logic matches expected backend!");
  } else {
    console.log(`⚠️  Mismatch: expected ${activeBackend}, got ${detectedBackend}`);
  }

  console.log("\n✅ GPU detection test complete!");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
