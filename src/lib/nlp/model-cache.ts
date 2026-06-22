/**
 * Model cache singleton with LRU eviction.
 *
 * Manages NLP pipeline instances with automatic unloading of idle models.
 * Models not accessed within IDLE_TTL_MS are evicted to free memory.
 */

import { pipeline, env } from "@huggingface/transformers";
import { logger } from "@/lib/logger";

type PipelineTask = Parameters<typeof pipeline>[0];

type BackendType = "wasm" | "webgpu";

/** Time in milliseconds before an idle model is unloaded (30 minutes). */
const IDLE_TTL_MS = 30 * 60 * 1000;

/** Hard cap on the number of cached pipelines to prevent unbounded memory growth. */
const MAX_CACHED_PIPELINES = 10;

interface CachedPipeline {
  instance: Awaited<ReturnType<typeof pipeline>>;
  task: PipelineTask;
  model: string;
  loadedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

interface ModelCacheStats {
  cachedModels: number;
  models: Array<{
    task: string;
    model: string;
    loadedAt: number;
    lastAccessedAt: number;
    idleMs: number;
    accessCount: number;
  }>;
  backend: BackendType | null;
  totalAccessCount: number;
}

const globalForNlp = globalThis as unknown as {
  nlpPipelines: Map<string, CachedPipeline> | undefined;
  nlpBackend: BackendType | undefined;
  nlpLoadingPromises: Map<string, Promise<Awaited<ReturnType<typeof pipeline>>>> | undefined;
};

function pipelineKey(task: PipelineTask, model: string): string {
  return `${task}::${model}`;
}

async function detectBackend(): Promise<BackendType> {
  if (
    typeof globalThis.navigator !== "undefined" &&
    "gpu" in globalThis.navigator
  ) {
    try {
      const adapter = await (
        globalThis.navigator as Navigator & {
          gpu: { requestAdapter: () => Promise<unknown> };
        }
      ).gpu.requestAdapter();
      if (adapter) {
        logger.info("nlp.backend.detected", { backend: "webgpu" });
        return "webgpu";
      }
    } catch {
      // WebGPU not available, fall through to WASM
    }
  }
  logger.info("nlp.backend.detected", { backend: "wasm" });
  return "wasm";
}

function getCache(): Map<string, CachedPipeline> {
  if (!globalForNlp.nlpPipelines) {
    globalForNlp.nlpPipelines = new Map();
  }
  return globalForNlp.nlpPipelines;
}

export async function getBackend(): Promise<BackendType> {
  if (!globalForNlp.nlpBackend) {
    globalForNlp.nlpBackend = await detectBackend();
  }
  return globalForNlp.nlpBackend;
}

function getLoadingPromises(): Map<string, Promise<Awaited<ReturnType<typeof pipeline>>>> {
  if (!globalForNlp.nlpLoadingPromises) {
    globalForNlp.nlpLoadingPromises = new Map();
  }
  return globalForNlp.nlpLoadingPromises;
}

/**
 * Get a model pipeline, loading it if not cached.
 * Updates lastAccessedAt and accessCount on cache hit.
 * Enforces MAX_CACHED_PIPELINES cap via LRU eviction.
 * Deduplicates concurrent loads for the same model.
 */
export async function getModelPipeline(
  task: PipelineTask,
  model: string,
): Promise<Awaited<ReturnType<typeof pipeline>>> {
  const cache = getCache();
  const key = pipelineKey(task, model);

  const cached = cache.get(key);
  if (cached) {
    cached.lastAccessedAt = Date.now();
    cached.accessCount++;
    logger.debug("nlp.pipeline.cache.hit", { task, model, accessCount: cached.accessCount });
    return cached.instance;
  }

  // Deduplicate concurrent loads for the same model
  const loadingPromises = getLoadingPromises();
  const existingLoad = loadingPromises.get(key);
  if (existingLoad) {
    logger.debug("nlp.pipeline.load.dedup", { task, model });
    return existingLoad;
  }

  const loadPromise = (async () => {
    // Evict least-recently-used entries if cache is at capacity
    while (cache.size >= MAX_CACHED_PIPELINES) {
      const lruEntry = findLeastRecentlyUsed(cache);
      if (!lruEntry) break;
      cache.delete(lruEntry.key);
      logger.info("nlp.pipeline.evict.lru", { task: lruEntry.task, model: lruEntry.model });
    }

    const backend = await getBackend();
    const startTime = Date.now();

    logger.info("nlp.pipeline.loading", { task, model, backend });

    const instance = await pipeline(task, model, {
      device: backend === "webgpu" ? "webgpu" : "cpu",
    });

    const elapsed = Date.now() - startTime;
    const now = Date.now();
    cache.set(key, {
      instance,
      task,
      model,
      loadedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
    });

    logger.info("nlp.pipeline.loaded", { task, model, backend, elapsedMs: elapsed });
    return instance;
  })();

  loadingPromises.set(key, loadPromise);
  try {
    return await loadPromise;
  } catch (error) {
    logger.error("nlp.pipeline.load.failed", {
      task,
      model,
      error: String(error),
    });
    throw error;
  } finally {
    loadingPromises.delete(key);
  }
}

/**
 * Find the least-recently-used entry in the cache.
 */
function findLeastRecentlyUsed(
  cache: Map<string, CachedPipeline>,
): { key: string; task: PipelineTask; model: string } | null {
  let oldest: { key: string; task: PipelineTask; model: string; lastAccessedAt: number } | null = null;

  for (const [key, entry] of cache.entries()) {
    if (!oldest || entry.lastAccessedAt < oldest.lastAccessedAt) {
      oldest = { key, task: entry.task, model: entry.model, lastAccessedAt: entry.lastAccessedAt };
    }
  }

  return oldest;
}

/**
 * Unload models that have been idle for longer than IDLE_TTL_MS.
 * Returns the number of models unloaded.
 */
export function unloadIdleModels(): number {
  const cache = getCache();
  const now = Date.now();
  let unloaded = 0;

  for (const [key, cached] of cache.entries()) {
    const idleMs = now - cached.lastAccessedAt;
    if (idleMs > IDLE_TTL_MS) {
      cache.delete(key);
      unloaded++;
      logger.info("nlp.model.unloaded", {
        task: cached.task,
        model: cached.model,
        idleMs,
        accessCount: cached.accessCount,
      });
    }
  }

  if (unloaded > 0) {
    logger.info("nlp.idle.models.unloaded", {
      count: unloaded,
      remaining: cache.size,
    });
  }

  return unloaded;
}

/**
 * Get statistics about the model cache for monitoring.
 */
export function getModelCacheStats(): ModelCacheStats {
  const cache = getCache();
  const now = Date.now();
  let totalAccessCount = 0;

  const models = Array.from(cache.values()).map((cached) => {
    const idleMs = now - cached.lastAccessedAt;
    totalAccessCount += cached.accessCount;
    return {
      task: cached.task,
      model: cached.model,
      loadedAt: cached.loadedAt,
      lastAccessedAt: cached.lastAccessedAt,
      idleMs,
      accessCount: cached.accessCount,
    };
  });

  return {
    cachedModels: cache.size,
    models,
    backend: globalForNlp.nlpBackend ?? null,
    totalAccessCount,
  };
}

export function clearModelCache(): void {
  const cache = getCache();
  const size = cache.size;
  cache.clear();
  logger.info("nlp.pipeline.cache.cleared", { pipelinesCleared: size });
}

export function getCachedPipelineCount(): number {
  return getCache().size;
}

export function configureModelCache(): void {
  env.cacheDir = process.env.NLP_MODEL_CACHE_DIR ?? null;
  env.allowLocalModels = process.env.NLP_ALLOW_LOCAL_MODELS === "true";
  env.allowRemoteModels = process.env.NLP_ALLOW_REMOTE_MODELS !== "false";

  logger.info("nlp.cache.configured", {
    cacheDir: env.cacheDir ?? "default",
    allowLocal: env.allowLocalModels,
    allowRemote: env.allowRemoteModels,
  });
}
