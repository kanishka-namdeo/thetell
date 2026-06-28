/**
 * Company enrichment Inngest function.
 *
 * Runs enrichment (feed discovery, ticker lookup, social profiles, blog discovery)
 * for a newly created company, then triggers signal discovery scraping.
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { enrichCompany } from "@/lib/enrichment";
import { logger } from "@/lib/logger";
import { runWithTraceAsync } from "@/lib/ai/trace-context";

export const enrichCompanyFunction = inngest.createFunction(
  {
    id: "enrich-company",
    triggers: [{ event: "company/enrichment.requested" }],
    retries: 2,
    timeouts: { finish: "10m" },
  },
  async ({ event, step }) => {
    if (!event.data.companyId) throw new NonRetriableError('Missing companyId');
    const { companyId } = event.data as { companyId: string };
    return runWithTraceAsync(
      {
        sessionId: companyId,
        traceName: "enrich-company",
        metadata: { companyId },
      },
      async () => {
        const log = logger.child({ function: "enrich-company", companyId });

        log.info("enrichment_job.start");

        const result = await step.run("enrich-company", async () => {
          return await enrichCompany(companyId);
        });

        if (!result) {
          throw new NonRetriableError(`Company enrichment failed: ${companyId}`);
        }

        log.info("enrichment_job.complete", { status: result.status });

        await step.run("trigger-discovery", async () => {
          await inngest.send({
            name: "signal/discovery.requested",
            data: {
              companyIds: [companyId],
              mode: "automated",
              hypothesisAware: true,
              stealthFallback: false,
            },
          });
        });

        log.info("enrichment_job.discovery_triggered");

        return { success: true, ...result };
      }
    );
  }
);

export const enrichmentFunctions = [enrichCompanyFunction];
