/**
 * Subreddit discovery Inngest functions.
 *
 * Weekly cron discovers/refreshes subreddits for all companies.
 * On-demand event trigger for single-company discovery.
 */

import { cron } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { discoverSubredditsForCompany } from "@/lib/reddit/subreddit-discovery";

export const discoverSubredditsFunction = inngest.createFunction(
  {
    id: "discover-subreddits",
    triggers: [cron("0 4 * * 1")], // Monday 4:00 AM UTC
    retries: 2,
  },
  async ({ step }) => {
    const log = logger.child({ function: "discover-subreddits" });
    log.info("subreddit_discovery.start");

    const companiesToProcess = await step.run(
      "find-companies-needing-discovery",
      async () => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const allCompanies = await prisma.company.findMany({
          select: { id: true, name: true },
        });

        const needingDiscovery: Array<{ id: string; name: string }> = [];
        for (const company of allCompanies) {
          const latestLog = await prisma.subredditDiscoveryLog.findFirst({
            where: { companyId: company.id },
            orderBy: { createdAt: "desc" },
          });
          if (!latestLog || latestLog.createdAt < sevenDaysAgo) {
            needingDiscovery.push({ id: company.id, name: company.name });
          }
        }
        return needingDiscovery.slice(0, 20);
      }
    );

    log.info("subreddit_discovery.companies_found", {
      count: companiesToProcess.length,
    });

    if (companiesToProcess.length === 0) {
      return { success: true, companiesProcessed: 0, results: [] };
    }

    const results: Array<{
      companyId: string;
      suggestedCount: number;
      validatedCount: number;
      status: string;
      error?: string;
    }> = [];

    for (const company of companiesToProcess) {
      try {
        const result = await step.run(
          `discover-${company.name.slice(0, 20)}`,
          async () => {
            return await discoverSubredditsForCompany(company.id);
          }
        );
        results.push({ companyId: company.id, ...result });
        log.info("subreddit_discovery.company_done", {
          companyId: company.id,
          companyName: company.name,
          status: result.status,
          validated: result.validatedCount,
        });
      } catch (error) {
        log.error("subreddit_discovery.company_failed", {
          companyId: company.id,
          companyName: company.name,
          error: String(error),
        });
        results.push({
          companyId: company.id,
          suggestedCount: 0,
          validatedCount: 0,
          status: "failed",
          error: String(error),
        });
      }
    }

    log.info("subreddit_discovery.complete", {
      companiesProcessed: results.length,
    });

    return { companiesProcessed: results.length, results };
  }
);

export const discoverSubredditsOnDemandFunction = inngest.createFunction(
  {
    id: "discover-subreddits-on-demand",
    triggers: [{ event: "company.subreddits.discover" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { companyId } = event.data as { companyId: string };
    const log = logger.child({ function: "discover-subreddits-on-demand", companyId });

    log.info("subreddit_discovery_on_demand.start");

    const result = await step.run("discover-subreddits", async () => {
      return await discoverSubredditsForCompany(companyId);
    });

    log.info("subreddit_discovery_on_demand.complete", {
      status: result.status,
      validated: result.validatedCount,
    });

    return { success: true, ...result };
  }
);

export const subredditDiscoveryFunctions = [
  discoverSubredditsFunction,
  discoverSubredditsOnDemandFunction,
];
