/**
 * Batch discovery Inngest function.
 * 
 * Runs discovery for a single company as part of a batch operation.
 * Each company gets its own session and runs independently.
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { runDiscovery, saveDiscoveredSources } from "@/lib/pipeline/discovery";

export const batchDiscoveryFunction = inngest.createFunction(
  {
    id: "batch-discovery",
    name: "Batch Discovery",
    triggers: [{ event: "batch/discovery.requested" }],
    retries: 2,
    timeouts: { finish: "10m" },
  },
  async ({ event, step }) => {
    if (!event.data.companyId) throw new NonRetriableError('Missing companyId');
    const { sessionId, companyId, companyName } = event.data;
    const log = logger.child({ sessionId, companyId, function: "batch-discovery" });

    log.info("batch_discovery.started", { companyName });

    try {
      // Run discovery
      const result = await step.run("run-discovery", async () => {
        return await runDiscovery(companyName, companyId, sessionId);
      });

      // Save discovered sources to database
      await step.run("save-sources", async () => {
        await saveDiscoveredSources(sessionId, result.verifiedSources);
      });

      // Update session status to completed
      await step.run("update-session", async () => {
        await prisma.pipelineDiscoverySession.update({
          where: { sessionId },
          data: {
            status: "completed",
            completedAt: new Date(),
            eventLog: JSON.parse(JSON.stringify(result.eventLog)),
          },
        });
      });

      log.info("batch_discovery.completed", {
        sessionId,
        sourcesFound: result.verifiedSources.length,
        gaps: result.gaps.length,
      });

      return {
        success: true,
        sessionId,
        sourcesFound: result.verifiedSources.length,
        gaps: result.gaps,
      };
    } catch (error) {
      log.error("batch_discovery.failed", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Update session status to failed
      await step.run("update-session-failed", async () => {
        await prisma.pipelineDiscoverySession.update({
          where: { sessionId },
          data: {
            status: "failed",
            completedAt: new Date(),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      });

      throw error;
    }
  }
);
