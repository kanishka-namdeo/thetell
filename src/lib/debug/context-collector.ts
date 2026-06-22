/**
 * System context collector for debug sessions.
 * Gathers real-time system state to enrich debug context automatically.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getAllScrapers, getApiKeyRequiredScrapers } from "@/lib/scraping/registry";

export interface DatabaseHealth {
  tableCounts: Record<string, number>;
  connectionStatus: "healthy" | "degraded" | "error";
  recentErrors: string[];
}

export interface ScraperStatus {
  total: number;
  enabled: number;
  disabled: number;
  apiKeyScrapers: Array<{
    name: string;
    envVar: string;
    configured: boolean;
    note?: string;
  }>;
}

export interface JobStatus {
  recentJobs: Array<{
    id: string;
    status: string;
    createdAt: string;
  }>;
  pendingCount: number;
  runningCount: number;
  failedCount: number;
}

export interface EnvironmentConfig {
  fastModel: string;
  reasoningModel: string;
  features: Record<string, boolean>;
}

export interface SystemContext {
  database: DatabaseHealth;
  scrapers: ScraperStatus;
  jobs: JobStatus;
  environment: EnvironmentConfig;
  collectedAt: string;
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const [signalCount, companyCount, analysisCount, articleCount, inferenceCount] =
      await Promise.all([
        prisma.signal.count(),
        prisma.company.count(),
        prisma.analysis.count(),
        prisma.article.count(),
        prisma.inference.count(),
      ]);

    return {
      tableCounts: {
        signals: signalCount,
        companies: companyCount,
        analyses: analysisCount,
        articles: articleCount,
        inferences: inferenceCount,
      },
      connectionStatus: "healthy",
      recentErrors: [],
    };
  } catch (error) {
    logger.error("context_collector.database_health_failed", { error: String(error) });
    return {
      tableCounts: {},
      connectionStatus: "error",
      recentErrors: [String(error)],
    };
  }
}

export function getScraperStatus(): ScraperStatus {
  const allScrapers = getAllScrapers();
  const apiKeyScrapers = getApiKeyRequiredScrapers();

  return {
    total: allScrapers.length,
    enabled: allScrapers.filter((s) => s.enabled).length,
    disabled: allScrapers.filter((s) => !s.enabled).length,
    apiKeyScrapers: apiKeyScrapers.map((s) => ({
      name: s.name,
      envVar: s.envVar,
      configured: s.configured,
      note: s.note,
    })),
  };
}

export async function getJobStatus(): Promise<JobStatus> {
  try {
    const [recentJobs, pendingCount, runningCount, failedCount] = await Promise.all([
      prisma.job.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true },
      }),
      prisma.job.count({ where: { status: "QUEUED" } }),
      prisma.job.count({ where: { status: "RUNNING" } }),
      prisma.job.count({ where: { status: "FAILED" } }),
    ]);

    return {
      recentJobs: recentJobs.map((j) => ({
        id: j.id,
        status: j.status,
        createdAt: j.createdAt.toISOString(),
      })),
      pendingCount,
      runningCount,
      failedCount,
    };
  } catch (error) {
    logger.error("context_collector.job_status_failed", { error: String(error) });
    return {
      recentJobs: [],
      pendingCount: 0,
      runningCount: 0,
      failedCount: 0,
    };
  }
}

export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    fastModel: process.env.FAST_MODEL || "not configured",
    reasoningModel: process.env.REASONING_MODEL || "not configured",
    features: {
      braveSearch: !!process.env.BRAVE_API_KEY,
      githubToken: !!process.env.GITHUB_TOKEN,
      usptoApi: !!process.env.USPTO_API_KEY,
      courtListenerApi: !!process.env.COURT_LISTENER_API_KEY,
      samApi: !!process.env.SAM_API_KEY,
      congressApi: !!process.env.CONGRESS_API_KEY,
    },
  };
}

export async function collectSystemContext(): Promise<SystemContext> {
  const [database, jobs] = await Promise.all([
    getDatabaseHealth(),
    getJobStatus(),
  ]);

  return {
    database,
    scrapers: getScraperStatus(),
    jobs,
    environment: getEnvironmentConfig(),
    collectedAt: new Date().toISOString(),
  };
}

export function formatSystemContext(ctx: SystemContext): string {
  const lines: string[] = [
    "## System Context (auto-collected)",
    "",
    `**Collected at**: ${ctx.collectedAt}`,
    "",
    "### Database",
    `- Connection: ${ctx.database.connectionStatus}`,
    ...Object.entries(ctx.database.tableCounts).map(
      ([table, count]) => `- ${table}: ${count} records`
    ),
    "",
    "### Scrapers",
    `- Total: ${ctx.scrapers.total} | Enabled: ${ctx.scrapers.enabled} | Disabled: ${ctx.scrapers.disabled}`,
    ...ctx.scrapers.apiKeyScrapers.map(
      (s) => `- ${s.name}: ${s.configured ? "configured" : "NOT configured"} (${s.envVar})${s.note ? ` — ${s.note}` : ""}`
    ),
    "",
    "### Background Jobs",
    `- Pending: ${ctx.jobs.pendingCount} | Running: ${ctx.jobs.runningCount} | Failed: ${ctx.jobs.failedCount}`,
  ];

  if (ctx.jobs.recentJobs.length > 0) {
    lines.push("", "**Recent jobs**:", ...ctx.jobs.recentJobs.map((j) => `- ${j.id} (${j.status}) at ${j.createdAt}`));
  }

  lines.push(
    "",
    "### Environment",
    `- Fast model: ${ctx.environment.fastModel}`,
    `- Reasoning model: ${ctx.environment.reasoningModel}`,
    ...Object.entries(ctx.environment.features).map(
      ([feature, enabled]) => `- ${feature}: ${enabled ? "enabled" : "disabled"}`
    )
  );

  return lines.join("\n");
}
