/**
 * Subreddit discovery Inngest functions.
 *
 * Weekly cron discovers/refreshes subreddits for all companies.
 * On-demand event trigger for single-company discovery.
 */

import { cron, NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { discoverSubredditsForCompany } from "@/lib/reddit/subreddit-discovery";

export const discoverSubredditsFunction = inngest.createFunction(
  {
    id: "discover-subreddits",
    triggers: [cron("0 4 * * 1")], // Monday 4:00 AM UTC
    retries: 2,
    timeouts: { finish: "10m" },
  },
  async ({ step }) => {
    const log = logger.child({ function: "discover-subreddits" });
    log.info("subreddit_discovery.start");

    const companiesToProcess = await step.run(
      "find-companies-needing-discovery",
      async () => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentLogCompanyIds = await prisma.subredditDiscoveryLog.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { companyId: true },
          distinct: ["companyId"],
        }).then(logs => logs.map(l => l.companyId));

        const needingDiscovery = await prisma.company.findMany({
          where: {
            AND: [
              { status: "ACTIVE" },
              { id: { notIn: recentLogCompanyIds } },
            ],
          },
          select: { id: true, name: true },
          take: 20,
        });

        return needingDiscovery;
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
    timeouts: { finish: "10m" },
  },
  async ({ event, step }) => {
    if (!event.data.companyId) throw new NonRetriableError('Missing companyId');
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
