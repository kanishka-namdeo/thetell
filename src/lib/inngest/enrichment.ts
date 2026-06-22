/**
 * Company enrichment Inngest function.
 *
 * Runs enrichment (feed discovery, ticker lookup, social profiles, blog discovery)
 * for a newly created company, then triggers signal discovery scraping.
 */

import { inngest } from "./client";
import { enrichCompany } from "@/lib/enrichment";
import { logger } from "@/lib/logger";

export const enrichCompanyFunction = inngest.createFunction(
  {
    id: "enrich-company",
    triggers: [{ event: "company/enrichment.requested" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { companyId } = event.data as { companyId: string };
    const log = logger.child({ function: "enrich-company", companyId });

    log.info("enrichment_job.start");

    const result = await step.run("enrich-company", async () => {
      return await enrichCompany(companyId);
    });

    log.info("enrichment_job.complete", { status: result.status });

    await step.run("trigger-discovery", async () => {
      await inngest.send({
        name: "company/discovery.requested",
        data: { companyId, scrapers: undefined },
      });
    });

    log.info("enrichment_job.discovery_triggered");

    return { success: true, ...result };
  }
);

export const enrichmentFunctions = [enrichCompanyFunction];
