/**
 * Model cache singleton with LRU eviction.
 *
 * Manages NLP pipeline instances with automatic unloading of idle models.
 * Models not accessed within IDLE_TTL_MS are evicted to free memory.
 */

import { pipeline, env } from "@huggingface/transformers";
import { logger } from "@/lib/logger";

type PipelineTask = Parameters<typeof pipeline>[0];

type BackendType = "cuda" | "dml" | "webgpu" | "cpu";

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
  dtype: string | null;
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

/**
 * Get list of supported backends from onnxruntime-node.
 * Returns empty array if not in Node.js environment or on error.
 */
async function getOrtBackends(): Promise<string[]> {
  try {
    const ort = await import("onnxruntime-node");
    const listFn = (ort as unknown as { listSupportedBackends?: () => Array<{ name: string }> })
      .listSupportedBackends;
    if (typeof listFn === "function") {
      return listFn().map((b) => b.name);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if CUDA (NVIDIA GPU) support is available via onnxruntime-node.
 * Note: CUDA EP is only available on Linux x64.
 */
async function hasCudaSupport(): Promise<boolean> {
  const backends = await getOrtBackends();
  return backends.includes("cuda");
}

/**
 * Check if DirectML (Windows GPU) support is available via onnxruntime-node.
 * DML works with AMD, Intel, and NVIDIA GPUs on Windows.
 */
async function hasDmlSupport(): Promise<boolean> {
  const backends = await getOrtBackends();
  return backends.includes("dml");
}

/**
 * Check if WebGPU support is available via onnxruntime-node or browser API.
 */
async function hasWebGpuSupport(): Promise<boolean> {
  // Check onnxruntime-node backends first (Node.js 23+ with WebGPU)
  const backends = await getOrtBackends();
  if (backends.includes("webgpu")) {
    return true;
  }

  // Check browser WebGPU API
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
      return !!adapter;
    } catch {
      return false;
    }
  }
  return false;
}

async function detectBackend(): Promise<BackendType> {
  // 1. Explicit env var override
  const envDevice = process.env.NLP_DEVICE?.toLowerCase();
  if (envDevice === "cuda" || envDevice === "dml" || envDevice === "webgpu" || envDevice === "cpu") {
    logger.info("nlp.backend.env_override", { backend: envDevice });
    return envDevice;
  }

  // 2. Try CUDA detection (Linux x64 only)
  if (await hasCudaSupport()) {
    logger.info("nlp.backend.detected", { backend: "cuda" });
    return "cuda";
  }

  // 3. Try DirectML detection (Windows GPU - works with NVIDIA, AMD, Intel)
  if (await hasDmlSupport()) {
    logger.info("nlp.backend.detected", { backend: "dml" });
    return "dml";
  }

  // 4. WebGPU (browser / Node.js 23+ with --experimental-webgpu)
  if (await hasWebGpuSupport()) {
    logger.info("nlp.backend.detected", { backend: "webgpu" });
    return "webgpu";
  }

  // 5. CPU fallback
  logger.info("nlp.backend.detected", { backend: "cpu" });
  return "cpu";
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
      const evicted = cache.get(lruEntry.key);
      if (evicted?.instance && typeof (evicted.instance as any).dispose === "function") {
        try { await (evicted.instance as any).dispose(); } catch { /* ignore dispose errors */ }
      }
      cache.delete(lruEntry.key);
      logger.info("nlp.pipeline.evict.lru", { task: lruEntry.task, model: lruEntry.model });
    }

    const backend = await getBackend();
    const startTime = Date.now();

    const deviceMap = {
      cuda: "cuda",
      dml: "dml",
      webgpu: "webgpu",
      cpu: "cpu",
    } as const;

    const dtypeMap = {
      cuda: "fp32",
      dml: "fp32",
      webgpu: "fp32",
      cpu: "q8",
    } as const;

    const device = deviceMap[backend];
    const dtype = dtypeMap[backend];

    logger.info("nlp.pipeline.loading", { task, model, backend, device, dtype });

    const instance = await pipeline(task, model, {
      device,
      dtype,
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

    logger.info("nlp.pipeline.loaded", { task, model, backend, device, dtype, elapsedMs: elapsed });
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
      if (cached.instance && typeof (cached.instance as any).dispose === "function") {
        try { (cached.instance as any).dispose(); } catch { /* ignore dispose errors */ }
      }
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

  const backend = globalForNlp.nlpBackend ?? null;
  const dtypeMap: Record<BackendType, string> = {
    cuda: "fp32",
    dml: "fp32",
    webgpu: "fp32",
    cpu: "q8",
  };
  const dtype = backend ? dtypeMap[backend] : null;

  return {
    cachedModels: cache.size,
    models,
    backend,
    dtype,
    totalAccessCount,
  };
}

export async function clearModelCache(): Promise<void> {
  const cache = getCache();
  const size = cache.size;

  // Dispose all pipeline instances before clearing to free memory
  for (const [key, cached] of cache.entries()) {
    if (cached.instance && typeof (cached.instance as any).dispose === "function") {
      try {
        await (cached.instance as any).dispose();
      } catch {
        // Ignore dispose errors during cache clear
      }
    }
    cache.delete(key);
  }

  logger.info("nlp.pipeline.cache.cleared", { pipelinesCleared: size });
}

export function getCachedPipelineCount(): number {
  return getCache().size;
}

export function configureModelCache(): void {
// Configure model cache based on environment variables
// Only override defaults if explicitly set
if (process.env.NLP_MODEL_CACHE_DIR) {
  env.cacheDir = process.env.NLP_MODEL_CACHE_DIR;
}
  // Default to true — local models should be used unless explicitly disabled
  env.allowLocalModels = process.env.NLP_ALLOW_LOCAL_MODELS !== "false";
  env.allowRemoteModels = process.env.NLP_ALLOW_REMOTE_MODELS !== "false";

  logger.info("nlp.cache.configured", {
    cacheDir: env.cacheDir ?? "default",
    allowLocal: env.allowLocalModels,
    allowRemote: env.allowRemoteModels,
  });
}

// Schedule idle model unloading every 5 minutes
if (typeof globalThis.setInterval !== "undefined") {
  const unloadTimer = setInterval(() => {
    try {
      unloadIdleModels();
    } catch (error) {
      logger.error("nlp.idle.unload.error", { error: String(error) });
    }
  }, 5 * 60 * 1000);
  // unref() prevents timer from keeping process alive
  if (typeof unloadTimer.unref === "function") {
    unloadTimer.unref();
  }
}
