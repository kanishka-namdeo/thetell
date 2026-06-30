/**
 * NLP Worker Thread Entry Point
 *
 * Task 4.4: Receives inference requests from the main thread,
 * lazily loads models via getModelPipeline, and returns results.
 *
 * This file is loaded by worker_threads.Worker as a standalone entry point.
 */

import { parentPort, isMainThread } from "worker_threads";
import { getModelPipeline } from "./model-cache";
import { logger } from "@/lib/logger";

if (!isMainThread && parentPort) {
  logger.debug("nlp.worker.started", { threadId: Date.now() });

  parentPort.on("message", async (msg: {
    id: string;
    task: "embedding" | "sentiment" | "quality" | "ping";
    model?: string;
    text?: string;
    labels?: string[];
  }) => {
    const { id, task, model, text, labels } = msg;

    try {
      if (task === "ping") {
        parentPort!.postMessage({ id, ok: true, data: "pong" });
        return;
      }

      if (!model || !text) {
        throw new Error(`Worker task ${task} requires model and text`);
      }

      let data: unknown;

      if (task === "embedding") {
        const extractor = await getModelPipeline(
          "feature-extraction",
          model,
        );
        const output = await (extractor as (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array; dispose?: () => void }>)(text, { pooling: "mean", normalize: true });

        try {
          data = Array.from(output.data as Float32Array);
        } finally {
          if (typeof output.dispose === "function") {
            output.dispose();
          }
        }
      } else if (task === "sentiment") {
        const classifier = await getModelPipeline(
          "text-classification",
          model,
        ) as (text: string) => Promise<Array<{ label: string; score: number }>>;

        const result = await classifier(text);

        try {
          data = result;
        } finally {
          if (result && typeof (result as unknown as { dispose?: () => void }).dispose === "function") {
            (result as unknown as { dispose: () => void }).dispose();
          }
        }
      } else if (task === "quality") {
        const classifier = await getModelPipeline(
          "zero-shot-classification",
          model,
        ) as (text: string, labels: string[]) => Promise<{ labels: string[]; scores: number[] }>;

        const result = await classifier(text.slice(0, 1000), labels || []);

        try {
          data = result;
        } finally {
          if (result && typeof (result as unknown as { dispose?: () => void }).dispose === "function") {
            (result as unknown as { dispose: () => void }).dispose();
          }
        }
      } else {
        throw new Error(`Unknown worker task: ${task}`);
      }

      parentPort!.postMessage({ id, ok: true, data });
    } catch (error) {
      logger.error("nlp.worker.task_failed", {
        taskId: id,
        task,
        error: String(error),
      });
      parentPort!.postMessage({ id, ok: false, error: String(error) });
    }
  });
}
