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
  task: {
    type: "embedding" | "sentiment" | "quality";
    model: string;
    text: string;
    labels?: string[];
  };
}

const DEFAULT_TASK_TIMEOUT_MS = 60_000;
const MAX_QUEUE_SIZE = 50;

class NlpWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private pendingTasks = new Map<string, PendingTask>();
  private taskWorkerMap = new Map<string, Worker>();
  private taskTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private taskQueue: PendingTask[] = [];
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
          const timeout = this.taskTimeouts.get(msg.id);
          if (timeout) {
            clearTimeout(timeout);
            this.taskTimeouts.delete(msg.id);
          }
          this.taskWorkerMap.delete(msg.id);
          this.availableWorkers.push(worker);

          if (msg.ok) {
            pending.resolve(msg.data);
          } else {
            pending.reject(new Error(msg.error || "Worker task failed"));
          }

          this.drainQueue();
        });

        worker.on("error", (error) => {
          logger.error("nlp.pool.worker_error", { workerId: i, error: String(error) });
          this.availableWorkers = this.availableWorkers.filter((w) => w !== worker);
          this.rejectTasksForWorker(worker);
        });

        worker.on("exit", (code) => {
          logger.warn("nlp.pool.worker_exited", { workerId: i, code });
          this.rejectTasksForWorker(worker);
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
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const worker = this.availableWorkers.pop();
      if (!worker) {
        // Queue the task if no worker is available
        const queuedTask = this.pendingTasks.get(taskId)!;
        if (this.taskQueue.length >= MAX_QUEUE_SIZE) {
          this.pendingTasks.delete(taskId);
          reject(new Error(`NLP task queue full (max ${MAX_QUEUE_SIZE})`));
          return;
        }
        this.taskQueue.push(queuedTask);
        logger.debug("nlp.pool.task_queued", { taskId, queueSize: this.taskQueue.length });
        return;
      }

      this.executeOnWorker(taskId, worker, task, resolve, reject);
    });
  }

  private executeOnWorker<T>(
    taskId: string,
    worker: Worker,
    task: {
      type: "embedding" | "sentiment" | "quality";
      model: string;
      text: string;
      labels?: string[];
    },
    resolve: (value: T) => void,
    reject: (reason: unknown) => void,
  ): void {
    this.taskWorkerMap.set(taskId, worker);

    const timeout = setTimeout(() => {
      this.pendingTasks.delete(taskId);
      this.taskWorkerMap.delete(taskId);
      this.taskTimeouts.delete(taskId);
      // Terminate and replace hung workers instead of returning them to the pool
      this.terminateAndReplaceWorker(worker);
      reject(new Error(`NLP task ${taskId} timed out after ${DEFAULT_TASK_TIMEOUT_MS}ms`));
    }, DEFAULT_TASK_TIMEOUT_MS);
    this.taskTimeouts.set(taskId, timeout);

    worker.postMessage({
      id: taskId,
      task: task.type,
      model: task.model,
      text: task.text,
      labels: task.labels,
    });
  }

  private terminateAndReplaceWorker(worker: Worker): void {
    // Remove from available workers if present
    this.availableWorkers = this.availableWorkers.filter((w) => w !== worker);

    // Terminate the hung worker
    worker.terminate().catch(() => {});

    // Remove from workers list
    this.workers = this.workers.filter((w) => w !== worker);

    // Spawn a replacement worker
    this.spawnReplacementWorker();
  }

  private spawnReplacementWorker(): void {
    try {
      const workerPath = require.resolve("./nlp-worker");
      const worker = new Worker(workerPath);

      worker.on("message", (msg: { id: string; ok: boolean; data?: unknown; error?: string }) => {
        const pending = this.pendingTasks.get(msg.id);
        if (!pending) return;

        this.pendingTasks.delete(msg.id);
        const timeout = this.taskTimeouts.get(msg.id);
        if (timeout) {
          clearTimeout(timeout);
          this.taskTimeouts.delete(msg.id);
        }
        this.taskWorkerMap.delete(msg.id);
        this.availableWorkers.push(worker);

        if (msg.ok) {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error || "Worker task failed"));
        }

        // Drain queue after task completion
        this.drainQueue();
      });

      worker.on("error", (error) => {
        logger.error("nlp.pool.worker_error", { error: String(error) });
        this.availableWorkers = this.availableWorkers.filter((w) => w !== worker);
        this.rejectTasksForWorker(worker);
      });

      worker.on("exit", (code) => {
        logger.warn("nlp.pool.worker_exited", { code });
        this.rejectTasksForWorker(worker);
        this.workers = this.workers.filter((w) => w !== worker);
        this.availableWorkers = this.availableWorkers.filter((w) => w !== worker);
      });

      this.workers.push(worker);
      this.availableWorkers.push(worker);

      // Drain queue with the new worker
      this.drainQueue();
    } catch (error) {
      logger.error("nlp.pool.replacement_failed", { error: String(error) });
    }
  }

  private drainQueue(): void {
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const queuedTask = this.taskQueue.shift()!;
      const worker = this.availableWorkers.pop()!;
      this.executeOnWorker(
        queuedTask.id,
        worker,
        queuedTask.task,
        queuedTask.resolve as (value: unknown) => void,
        queuedTask.reject,
      );
      logger.debug("nlp.pool.task_dequeued", { taskId: queuedTask.id, queueSize: this.taskQueue.length });
    }
  }

  private rejectTasksForWorker(worker: Worker): void {
    for (const [taskId, taskWorker] of this.taskWorkerMap.entries()) {
      if (taskWorker === worker) {
        const pending = this.pendingTasks.get(taskId);
        if (pending) {
          this.pendingTasks.delete(taskId);
          const timeout = this.taskTimeouts.get(taskId);
          if (timeout) {
            clearTimeout(timeout);
            this.taskTimeouts.delete(taskId);
          }
          pending.reject(new Error(`Worker error/exit, task ${taskId} failed`));
        }
        this.taskWorkerMap.delete(taskId);
      }
    }
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
    // Clear all pending timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.taskTimeouts.clear();

    // Clear all maps
    this.taskWorkerMap.clear();
    this.pendingTasks.clear();
    this.taskQueue = [];

    // Terminate all workers
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.initialized = false;
    logger.info("nlp.pool.shutdown");
  }
}

const _poolParsed = parseInt(process.env.NLP_WORKER_COUNT || "2", 10);
const POOL_SIZE = Number.isNaN(_poolParsed) || _poolParsed < 1 ? 2 : Math.min(_poolParsed, 16);

// Use globalThis pattern to prevent worker leak on hot-reload (Next.js dev mode)
const globalForNlp = globalThis as unknown as {
  nlpPool: NlpWorkerPool | undefined;
};

export const nlpPool = globalForNlp.nlpPool ?? new NlpWorkerPool(POOL_SIZE);
globalForNlp.nlpPool = nlpPool;

// Graceful shutdown: terminate worker threads on process exit
// to prevent orphaned OS threads
if (typeof process !== "undefined" && process.on) {
  const shutdownHandler = () => {
    nlpPool.shutdown().catch(() => {});
  };
  process.on("beforeExit", shutdownHandler);
  process.on("SIGTERM", shutdownHandler);
  process.on("SIGINT", shutdownHandler);
}
