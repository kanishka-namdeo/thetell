import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getModelPipeline } from "@/lib/nlp/model-cache";

/**
 * Model warm-up endpoint.
 *
 * Pre-loads all NLP models to avoid cold start latency on first requests.
 * Protected by admin role check or ADMIN_API_KEY header.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Check authentication: admin role or API key
    const isAdmin = await checkAdminAccess(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    logger.info("nlp.warmup.start");

    const models = [
      { task: "text-classification" as const, model: "Xenova/fasttext-language-identification", name: "language-detector" },
      { task: "text-classification" as const, model: "ProsusAI/finbert", name: "sentiment-classifier" },
      { task: "token-classification" as const, model: "Xenova/bert-base-NER", name: "entity-extractor" },
      { task: "feature-extraction" as const, model: "Xenova/all-MiniLM-L6-v2", name: "embedding-generator" },
      { task: "zero-shot-classification" as const, model: "Xenova/bart-large-mnli", name: "quality-gate" },
    ];

    const results: Array<{
      model: string;
      status: "loaded" | "failed";
      elapsedMs?: number;
      error?: string;
    }> = [];

    // Load models sequentially to avoid memory spikes
    for (const { task, model, name } of models) {
      const modelStart = Date.now();
      try {
        await getModelPipeline(task, model);
        const elapsed = Date.now() - modelStart;
        results.push({ model: name, status: "loaded", elapsedMs: elapsed });
        logger.info("nlp.warmup.model.loaded", { model: name, elapsedMs: elapsed });
      } catch (error) {
        const elapsed = Date.now() - modelStart;
        results.push({
          model: name,
          status: "failed",
          elapsedMs: elapsed,
          error: String(error),
        });
        logger.error("nlp.warmup.model.failed", {
          model: name,
          elapsedMs: elapsed,
          error: String(error),
        });
      }
    }

    const totalElapsed = Date.now() - startTime;
    const loadedCount = results.filter((r) => r.status === "loaded").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    logger.info("nlp.warmup.complete", {
      totalElapsedMs: totalElapsed,
      loadedCount,
      failedCount,
    });

    return NextResponse.json({
      success: failedCount === 0,
      totalElapsedMs: totalElapsed,
      models: results,
      summary: {
        loaded: loadedCount,
        failed: failedCount,
        total: models.length,
      },
    });
  } catch (error) {
    logger.error("nlp.warmup.failed", { error: String(error) });
    return NextResponse.json(
      { error: "warmup_failed", message: "Model warm-up failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Check if the request has admin access.
 * Accepts either:
 * 1. Authenticated user with ADMIN role
 * 2. Valid ADMIN_API_KEY header
 */
async function checkAdminAccess(req: NextRequest): Promise<boolean> {
  // Check for admin API key header
  const apiKey = req.headers.get("x-admin-api-key");
  const expectedKey = process.env.ADMIN_API_KEY;
  if (apiKey && expectedKey && apiKey === expectedKey) {
    return true;
  }

  // Check for authenticated admin user
  try {
    const session = await auth();
    if (session?.user?.role === "ADMIN") {
      return true;
    }
  } catch {
    // Auth check failed, continue to deny access
  }

  return false;
}
