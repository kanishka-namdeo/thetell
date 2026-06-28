/**
 * Cron trigger for automated signal discovery.
 * Delegates to the unified signal-discovery.ts function via event.
 */

import { inngest } from "./client";
import { cron } from "inngest";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Daily cron that triggers unified signal discovery for all companies.
 * Runs at 2:00 AM UTC.
 */
export const discoverSignalsCronFunction = inngest.createFunction(
  {
    id: "discover-signals-cron",
    triggers: [cron("0 2 * * *")],
    retries: 2,
    timeouts: { finish: "5m" },
  },
  async ({ step }) => {
    const log = logger.child({ function: "discover-signals-cron" });

    const systemConfig = await prisma.systemConfig.findFirst();
    if (systemConfig && systemConfig.discoveryEnabled === false) {
      log.info("discovery.skip.disabled");
      return { skipped: true, reason: "Discovery disabled" };
    }

    await step.run("send-unified-discovery-event", async () => {
      await inngest.send({
        name: "signal/discovery.requested",
        data: {
          companyIds: "all",
          mode: "automated",
          hypothesisAware: true,
          stealthFallback: true,
        },
      });
    });

    log.info("discovery.cron.triggered");
    return { triggered: true };
  }
);

export const discoveryFunctions = [discoverSignalsCronFunction];
