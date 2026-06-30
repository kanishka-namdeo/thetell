import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import {
  getModelCacheStats,
  getNlpFeatureFlags,
  getBackend,
} from "@/lib/nlp";
import { logger } from "@/lib/logger";

/**
 * GET /api/v1/admin/nlp/status
 *
 * Returns NLP pipeline diagnostic information:
 * - Model cache status (loaded models, memory usage)
 * - Process memory usage (RSS, heap)
 * - Feature flags
 * - Backend/device detection
 * - Health check for each NLP capability
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 401 }
      );
    }

    const cacheStats = getModelCacheStats();
    const featureFlags = getNlpFeatureFlags();
    const backend = await getBackend();
    const memory = process.memoryUsage();

    const estimatedMemoryMB = cacheStats.cachedModels * 400;

    return NextResponse.json({
      status: "ok",
      backend,
      cache: {
        modelsLoaded: cacheStats.cachedModels,
        estimatedMemoryMB,
        models: cacheStats.models.map((m) => ({
          task: m.task,
          model: m.model,
          loadedAt: new Date(m.loadedAt).toISOString(),
          lastAccessedAt: new Date(m.lastAccessedAt).toISOString(),
          accessCount: m.accessCount,
        })),
      },
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
      },
      featureFlags,
      capabilities: {
        sentiment: {
          enabled: featureFlags.sentiment,
          model: "ProsusAI/finbert",
          task: "text-classification",
        },
        qualityGate: {
          enabled: featureFlags.qualityGate,
          model: "Xenova/bart-large-mnli",
          task: "zero-shot-classification",
        },
        ner: {
          enabled: featureFlags.ner,
          model: "Xenova/bert-base-NER",
          task: "token-classification",
        },
        embeddings: {
          enabled: featureFlags.embeddings,
          model: "Xenova/all-MiniLM-L6-v2",
          task: "feature-extraction",
          dimensions: 384,
        },
        keyphrases: {
          enabled: featureFlags.keyphrases,
          model: "Xenova/all-MiniLM-L6-v2 (shared with embeddings)",
          task: "feature-extraction",
        },
        languageDetection: {
          enabled: featureFlags.languageDetect,
          model: "Xenova/fasttext-language-identification",
          task: "text-classification",
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("admin.nlp.status.error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to retrieve NLP status" },
      { status: 500 }
    );
  }
}
