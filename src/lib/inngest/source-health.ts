/**
 * Source health background job.
 *
 * Periodically re-validates CompanyDataSource URLs by checking HTTP reachability.
 * Auto-disables sources that fail 10 consecutive checks.
 */

import { inngest } from "./client";
import { cron } from "inngest";
import { prisma } from "@/lib/db";
import { verifySourceUrls } from "@/lib/sources/verifier";
import { logger } from "@/lib/logger";

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CONSECUTIVE_FAILURES = 10;
const VERIFY_BATCH_SIZE = 50;

export const sourceHealthCheckFunction = inngest.createFunction(
  {
    id: "source-health-check",
    triggers: [
      cron("0 6 * * *"), // Daily at 6:00 AM UTC
      { event: "source/health.check" },
    ],
    retries: 2,
    timeouts: { finish: "10m" },
  },
  async ({ step }) => {
    const log = logger.child({ function: "source-health-check" });

    log.info("source_health.start");

    // Step 1: Fetch stale sources
    const staleSources = await step.run("fetch-stale-sources", async () => {
      const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

      return prisma.companyDataSource.findMany({
        where: {
          isActive: true,
          OR: [
            { lastCheckedAt: null },
            { lastCheckedAt: { lt: staleThreshold } },
          ],
        },
        take: VERIFY_BATCH_SIZE,
        orderBy: { lastCheckedAt: "asc" },
      });
    });

    log.info("source_health.sources_found", { count: staleSources.length });

    if (staleSources.length === 0) {
      return { success: true, checked: 0, message: "No stale sources found" };
    }

    // Step 2: Verify URLs in batch
    const urls = staleSources.map((s) => s.url);
    const results = await step.run("verify-urls", async () => {
      return verifySourceUrls(urls, 5);
    });

    // Step 3: Update each source and collect per-company summaries
    const companyResults = await step.run("update-sources", async () => {
      const companyMap = new Map<
        string,
        { checked: number; succeeded: number; failed: number }
      >();

      for (let i = 0; i < staleSources.length; i++) {
        const source = staleSources[i];
        const result = results[i];

        const companyId = source.companyId;
        if (!companyMap.has(companyId)) {
          companyMap.set(companyId, { checked: 0, succeeded: 0, failed: 0 });
        }
        const summary = companyMap.get(companyId)!;
        summary.checked++;

        if (result.reachable) {
          summary.succeeded++;
          await prisma.companyDataSource.update({
            where: { id: source.id },
            data: {
              lastCheckedAt: new Date(),
              lastSuccessAt: new Date(),
              consecutiveFailures: 0,
              httpStatusCode: result.statusCode ?? null,
              failureReason: null,
            },
          });
        } else {
          summary.failed++;
          const newFailures = source.consecutiveFailures + 1;
          const shouldDisable = newFailures >= MAX_CONSECUTIVE_FAILURES;

          await prisma.companyDataSource.update({
            where: { id: source.id },
            data: {
              lastCheckedAt: new Date(),
              consecutiveFailures: newFailures,
              httpStatusCode: result.statusCode ?? null,
              failureReason: result.error ?? "Unreachable",
              ...(shouldDisable ? { isActive: false } : {}),
            },
          });

          if (shouldDisable) {
            log.warn("source_health.source_disabled", {
              sourceId: source.id,
              companyId,
              consecutiveFailures: newFailures,
            });
          }
        }
      }

      // Convert Map to plain object for Inngest serialization
      return Object.fromEntries(companyMap);
    });

    // Step 4: Create enrichment log entries per company
    await step.run("log-results", async () => {
      const companyEntries = Object.entries(companyResults);
      const logEntries = companyEntries.map(
        ([companyId, summary]) => {
          const allSucceeded = summary.failed === 0;
          const allFailed = summary.succeeded === 0;
          const status = allSucceeded
            ? "success"
            : allFailed
              ? "failed"
              : "partial";

          return prisma.companyEnrichmentLog.create({
            data: {
              companyId,
              status,
              feedsValidated: summary.checked,
              durationMs: 0,
              error:
                status === "failed"
                  ? `All ${summary.checked} source(s) failed health check`
                  : status === "partial"
                    ? `${summary.failed}/${summary.checked} source(s) failed health check`
                    : undefined,
            },
          });
        }
      );

      await Promise.all(logEntries);
    });

    const totalChecked = staleSources.length;
    const totalSucceeded = results.filter((r) => r.reachable).length;
    const totalFailed = totalChecked - totalSucceeded;
    const companyCount = Object.keys(companyResults).length;

    log.info("source_health.complete", {
      checked: totalChecked,
      succeeded: totalSucceeded,
      failed: totalFailed,
      companies: companyCount,
    });

    return {
      success: true,
      checked: totalChecked,
      succeeded: totalSucceeded,
      failed: totalFailed,
      companies: companyCount,
    };
  }
);

export const sourceHealthFunctions = [sourceHealthCheckFunction];
