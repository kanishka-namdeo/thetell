import { inngest } from "./client";
import { cron } from "inngest";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Hourly cron that resets stale ANALYZING signals back to PENDING.
 * Recovers signals stuck due to function crashes or timeouts.
 */
export const recoverOrphanedSignalsFunction = inngest.createFunction(
  {
    id: "recover-orphaned-signals",
    triggers: [cron("0 * * * *")], // Every hour
    retries: 2,
    timeouts: { finish: "5m" },
  },
  async ({ step }) => {
    const log = logger.child({ function: "recover-orphaned-signals" });

    const result = await step.run("reset-stale-signals", async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const updated = await prisma.signal.updateMany({
        where: {
          status: "ANALYZING",
          updatedAt: { lt: thirtyMinutesAgo },
        },
        data: {
          status: "PENDING",
        },
      });

      log.info("orphan_recovery.complete", {
        signalsRecovered: updated.count,
      });

      return { signalsRecovered: updated.count };
    });

    return result;
  }
);

export const orphanRecoveryFunctions = [recoverOrphanedSignalsFunction];
