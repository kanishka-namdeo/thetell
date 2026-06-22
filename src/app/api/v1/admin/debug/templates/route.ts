import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import {
  collectSystemContext,
  formatSystemContext,
} from "@/lib/debug/context-collector";

interface DebugTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  problemTemplate: string;
  contextFetcher: string | null;
}

const TEMPLATES: DebugTemplate[] = [
  {
    id: "scraper-failing",
    label: "Scraper Failing",
    description: "Diagnose why a specific scraper is not returning results or throwing errors",
    icon: "Bug",
    problemTemplate:
      "Scraper [NAME] is failing. It was working before but now returns errors or no results. Please investigate the scraper configuration, check if the target site is accessible, and identify the root cause.",
    contextFetcher: "scraper",
  },
  {
    id: "company-no-signals",
    label: "Company Has No Signals",
    description: "A company exists in the database but no signals are being collected for it",
    icon: "SearchX",
    problemTemplate:
      "Company [NAME/ID] has zero signals. It should have signals from RSS feeds and news scrapers. Please check if the company has data sources configured, if the scrapers are targeting the right feeds, and why discovery is not finding signals.",
    contextFetcher: "company",
  },
  {
    id: "analysis-pipeline-error",
    label: "Analysis Pipeline Error",
    description: "Signals are being scraped but analysis or article generation is failing",
    icon: "BrainCircuit",
    problemTemplate:
      "The analysis pipeline is failing. Signals are being scraped successfully but analysis or article generation throws errors. Please check the LLM provider configuration, model availability, and recent error logs.",
    contextFetcher: "analysis",
  },
  {
    id: "background-job-stuck",
    label: "Background Job Stuck",
    description: "An Inngest background job is stuck, not progressing, or repeatedly failing",
    icon: "Clock",
    problemTemplate:
      "A background job appears to be stuck or not completing. Please check the Inngest job queue, look for dead-letter jobs, check if the worker is processing jobs, and identify any bottlenecks.",
    contextFetcher: "jobs",
  },
  {
    id: "database-anomaly",
    label: "Database Anomaly",
    description: "Unexpected data patterns, missing records, or connection issues in the database",
    icon: "Database",
    problemTemplate:
      "There appears to be a database anomaly. Please check table counts, look for orphaned records, verify connection health, and investigate any recent errors in the database layer.",
    contextFetcher: "database",
  },
];

export async function GET() {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    return NextResponse.json({ templates: TEMPLATES });
  } catch (error) {
    logger.error("debug.templates.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal error", message: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { templateId } = body as { templateId?: string };

    if (!templateId) {
      return NextResponse.json(
        { error: "Invalid input", message: "templateId is required" },
        { status: 400 }
      );
    }

    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json(
        { error: "Not found", message: `Template '${templateId}' not found` },
        { status: 404 }
      );
    }

    const systemCtx = await collectSystemContext();
    const formattedContext = formatSystemContext(systemCtx);

    return NextResponse.json({
      template: {
        id: template.id,
        label: template.label,
        problemTemplate: template.problemTemplate,
      },
      systemContext: formattedContext,
    });
  } catch (error) {
    logger.error("debug.templates.resolve_error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal error", message: "Failed to resolve template" },
      { status: 500 }
    );
  }
}
