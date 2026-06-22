/**
 * Weekly calibration function for resolving inferences.
 * Runs Monday 6 AM UTC to check if predicted outcomes have been
 * supported or contradicted by newer signals.
 */

import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateEmbedding,
  cosineSimilarity,
} from "@/lib/nlp/embedding-generator";

const EVIDENCE_THRESHOLD = 3;
const SIMILARITY_THRESHOLD = 0.6;

export const calibrateInferencesFunction = inngest.createFunction(
  {
    id: "calibrate-inferences",
    triggers: [{ cron: "0 6 * * 1" }], // Monday 6 AM UTC
    retries: 2,
  },
  async ({ step }) => {
    const log = logger.child({ function: "calibrate-inferences" });
    log.info("calibration.start");

    // Step 1: Find inferences with predicted outcomes that are not yet resolved
    const pendingInferences = await step.run("load-pending-inferences", async () => {
      const inferences = await prisma.inference.findMany({
        where: {
          predictedOutcome: { not: null },
          status: { in: ["EMERGING", "DEVELOPING"] },
        },
        include: {
          company: { select: { id: true, name: true } },
        },
        take: 100,
        orderBy: { confidence: "desc" },
      });

      log.info("calibration.inferences_loaded", {
        count: inferences.length,
      });

      return inferences;
    });

    if (pendingInferences.length === 0) {
      log.info("calibration.no_pending_inferences");
      return { success: true, calibrated: 0, reason: "no_pending_inferences" };
    }

    let calibratedCount = 0;

    // Step 2: Process each inference
    for (const inference of pendingInferences) {
      const inferenceLog = logger.child({
        function: "calibrate-inferences",
        inferenceId: inference.id,
        companyId: inference.companyId,
      });

      try {
        // Step 2a: Find newer signals from the same company after inference creation
        const newerSignals = await step.run(
          `find-newer-signals-${inference.id}`,
          async () => {
            return prisma.signal.findMany({
              where: {
                companyId: inference.companyId,
                createdAt: { gt: inference.createdAt },
                status: "ANALYZED",
              },
              orderBy: { createdAt: "desc" },
              take: 50,
            });
          },
        );

        if (newerSignals.length === 0) {
          inferenceLog.debug("calibration.no_newer_signals");
          continue;
        }

        // Step 2b: Generate embedding for the prediction
        const predictionEmbedding = await step.run(
          `generate-prediction-embedding-${inference.id}`,
          async () => {
            return generateEmbedding(inference.predictedOutcome!);
          },
        );

        // Step 2c: Compare each signal against the prediction
        const evidenceResults = await step.run(
          `analyze-evidence-${inference.id}`,
          async () => {
            const supporting: Array<{ signalId: string; similarity: number; sentiment: string }> = [];
            const contradicting: Array<{ signalId: string; similarity: number; sentiment: string }> = [];

            for (const signal of newerSignals) {
              const signalEmbedding = await generateEmbedding(signal.rawContent);
              const similarity = cosineSimilarity(predictionEmbedding, signalEmbedding);

              if (similarity < SIMILARITY_THRESHOLD) continue;

              // Determine sentiment direction from analyses
              const analyses = await prisma.analysis.findMany({
                where: { signalId: signal.id },
                select: { sentiment: true },
              });

              const avgSentiment =
                analyses.length > 0
                  ? analyses.filter((a) => a.sentiment === "POSITIVE").length >
                    analyses.filter((a) => a.sentiment === "NEGATIVE").length
                    ? "POSITIVE"
                    : analyses.filter((a) => a.sentiment === "NEGATIVE").length > 0
                      ? "NEGATIVE"
                      : "NEUTRAL"
                  : "NEUTRAL";

              const entry = {
                signalId: signal.id,
                similarity,
                sentiment: avgSentiment,
              };

              // Positive sentiment for relevant signals suggests support
              if (avgSentiment === "POSITIVE") {
                supporting.push(entry);
              } else if (avgSentiment === "NEGATIVE") {
                contradicting.push(entry);
              }
            }

            return { supporting, contradicting };
          },
        );

        // Step 2d: Evaluate evidence and update inference status
        await step.run(`evaluate-inference-${inference.id}`, async () => {
          const supportCount = evidenceResults.supporting.length;
          const contradictCount = evidenceResults.contradicting.length;

          if (supportCount >= EVIDENCE_THRESHOLD && supportCount > contradictCount) {
            // CONFIRMED: enough supporting evidence
            await prisma.inference.update({
              where: { id: inference.id },
              data: {
                status: "CONFIRMED",
                supportingSignalIds: evidenceResults.supporting.map((e) => e.signalId),
                contradictingSignalIds: evidenceResults.contradicting.map((e) => e.signalId),
              },
            });

            await prisma.inferenceCalibration.create({
              data: {
                inferenceId: inference.id,
                prediction: inference.predictedOutcome!,
                wasCorrect: true,
                sourceReliability:
                  evidenceResults.supporting.reduce((sum, e) => sum + e.similarity, 0) /
                  supportCount,
                notes: `Confirmed by ${supportCount} supporting signals. ${contradictCount} contradicting signals.`,
              },
            });

            inferenceLog.info("calibration.inference_confirmed", {
              supportCount,
              contradictCount,
            });

            calibratedCount++;
          } else if (contradictCount >= EVIDENCE_THRESHOLD && contradictCount > supportCount) {
            // REFUTED: enough contradicting evidence
            await prisma.inference.update({
              where: { id: inference.id },
              data: {
                status: "REFUTED",
                supportingSignalIds: evidenceResults.supporting.map((e) => e.signalId),
                contradictingSignalIds: evidenceResults.contradicting.map((e) => e.signalId),
              },
            });

            await prisma.inferenceCalibration.create({
              data: {
                inferenceId: inference.id,
                prediction: inference.predictedOutcome!,
                wasCorrect: false,
                sourceReliability:
                  evidenceResults.contradicting.reduce((sum, e) => sum + e.similarity, 0) /
                  contradictCount,
                notes: `Refuted by ${contradictCount} contradicting signals. ${supportCount} supporting signals.`,
              },
            });

            inferenceLog.info("calibration.inference_refuted", {
              supportCount,
              contradictCount,
            });

            calibratedCount++;
          } else {
            inferenceLog.debug("calibration.insufficient_evidence", {
              supportCount,
              contradictCount,
              threshold: EVIDENCE_THRESHOLD,
            });
          }
        });
      } catch (error) {
        inferenceLog.error("calibration.inference_failed", {
          error: String(error),
        });
      }
    }

    log.info("calibration.complete", {
      totalProcessed: pendingInferences.length,
      calibrated: calibratedCount,
    });

    return {
      success: true,
      totalProcessed: pendingInferences.length,
      calibrated: calibratedCount,
    };
  },
);
