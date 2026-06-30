/**
 * NLP Thread Pool Manager
 *
 * Task 4.4: Manages a pool of worker threads for NLP inference.
 * Dispatches tasks to available workers and returns promises.
 *
 * Falls back to direct execution if worker_threads are unavailable.
 */

import { Worker, isMainThread } from "worker_threads";
import { logger } from "@/lib/logger";
import { getModelPipeline } from "./model-cache";

interface PendingTask {
  id: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

class NlpWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private pendingTasks = new Map<string, PendingTask>();
  private taskCounter = 0;
  private initialized = false;
  private useFallback = false;

  constructor(private workerCount: number = 2) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check if worker_threads are available
    if (!isMainThread) {
      logger.warn("nlp.pool.not_main_thread", { reason: "Cannot spawn workers from worker thread" });
      this.useFallback = true;
      this.initialized = true;
      return;
    }

    try {
      // Use require.resolve to find the worker file in both dev and production builds
      const workerPath = require.resolve("./nlp-worker");

      for (let i = 0; i < this.workerCount; i++) {
        const worker = new Worker(workerPath);

        worker.on("message", (msg: { id: string; ok: boolean; data?: unknown; error?: string }) => {
          const pending = this.pendingTasks.get(msg.id);
          if (!pending) return;

          this.pendingTasks.delete(msg.id);
          this.availableWorkers.push(worker);

          if (msg.ok) {
            pending.resolve(msg.data);
          } else {
            pending.reject(new Error(msg.error || "Worker task failed"));
          }
        });

        worker.on("error", (error) => {
          logger.error("nlp.pool.worker_error", { workerId: i, error: String(error) });
        });

        worker.on("exit", (code) => {
          logger.warn("nlp.pool.worker_exited", { workerId: i, code });
          this.workers = this.workers.filter((w) => w !== worker);
          this.availableWorkers = this.availableWorkers.filter((w) => w !== worker);
        });

        this.workers.push(worker);
        this.availableWorkers.push(worker);
      }

      this.initialized = true;
      logger.info("nlp.pool.initialized", { workerCount: this.workerCount });
    } catch (error) {
      logger.warn("nlp.pool.initialialization_failed", { error: String(error), fallback: "direct execution" });
      this.useFallback = true;
      this.initialized = true;
    }
  }

  async dispatch<T>(task: {
    type: "embedding" | "sentiment" | "quality";
    model: string;
    text: string;
    labels?: string[];
  }): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Fallback to direct execution if workers are not available
    if (this.useFallback) {
      return await this.executeDirect<T>(task);
    }

    const taskId = `task_${++this.taskCounter}_${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
      this.pendingTasks.set(taskId, {
        id: taskId,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const worker = this.availableWorkers.pop();
      if (!worker) {
        this.pendingTasks.delete(taskId);
        reject(new Error("No available workers"));
        return;
      }

      worker.postMessage({
        id: taskId,
        task: task.type,
        model: task.model,
        text: task.text,
        labels: task.labels,
      });
    });
  }

  /**
   * Direct execution fallback when workers are not available.
   * Runs inference in the main thread using getModelPipeline.
   */
  private async executeDirect<T>(task: {
    type: "embedding" | "sentiment" | "quality";
    model: string;
    text: string;
    labels?: string[];
  }): Promise<T> {
    logger.debug("nlp.pool.direct_execution", { type: task.type, model: task.model });

    if (task.type === "embedding") {
      const extractor = await getModelPipeline("feature-extraction", task.model);
      const output = await (extractor as (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array; dispose?: () => void }>)(
        task.text,
        { pooling: "mean", normalize: true }
      );

      try {
        return Array.from(output.data) as unknown as T;
      } finally {
        if (typeof output.dispose === "function") {
          output.dispose();
        }
      }
    }

    if (task.type === "sentiment") {
      const classifier = await getModelPipeline("text-classification", task.model);
      const result = await (classifier as (text: string) => Promise<Array<{ label: string; score: number }>>)(task.text);

      try {
        return result as unknown as T;
      } finally {
        if (result && typeof (result as unknown as { dispose?: () => void }).dispose === "function") {
          (result as unknown as { dispose: () => void }).dispose();
        }
      }
    }

    if (task.type === "quality") {
      const classifier = await getModelPipeline("zero-shot-classification", task.model);
      const result = await (classifier as (text: string, labels: string[]) => Promise<{ labels: string[]; scores: number[] }>)(
        task.text,
        task.labels || []
      );

      try {
        return result as unknown as T;
      } finally {
        if (result && typeof (result as unknown as { dispose?: () => void }).dispose === "function") {
          (result as unknown as { dispose: () => void }).dispose();
        }
      }
    }

    throw new Error(`Unknown task type: ${task.type}`);
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.pendingTasks.clear();
    this.initialized = false;
    logger.info("nlp.pool.shutdown");
  }
}

const _poolParsed = parseInt(process.env.NLP_WORKER_COUNT || "2", 10);
const POOL_SIZE = Number.isNaN(_poolParsed) || _poolParsed < 1 ? 2 : Math.min(_poolParsed, 16);
export const nlpPool = new NlpWorkerPool(POOL_SIZE);
