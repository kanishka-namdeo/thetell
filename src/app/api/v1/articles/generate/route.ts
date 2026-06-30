import { NextRequest, NextResponse } from "next/server";
import { AgentPersona } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/articles/generate" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { companyId, analysisIds, agentPersona, customHeadline } = body;

    log.info("api.request.start", { method: "POST", path: "/api/v1/articles/generate" });

    if (!companyId || !analysisIds || !Array.isArray(analysisIds) || analysisIds.length === 0) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Company ID and at least one analysis ID are required",
          details: {
            companyId: !companyId ? ["Required"] : undefined,
            analysisIds: !analysisIds || analysisIds.length === 0 ? ["At least one required"] : undefined,
          },
        },
        { status: 400 }
      );
    }

    if (agentPersona && !["ANALYST", "GOSSIP_GIRL"].includes(agentPersona)) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid agent persona",
          details: {
            agentPersona: ["Must be ANALYST or GOSSIP_GIRL"],
          },
        },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    const analyses = await prisma.analysis.findMany({
      where: { id: { in: analysisIds } },
      include: { signal: true },
    });

    if (analyses.length !== analysisIds.length) {
      return NextResponse.json(
        { error: "not_found", message: "One or more analyses not found" },
        { status: 404 }
      );
    }

    const invalidAnalyses = analyses.filter((a) => a.signal.companyId !== companyId);
    if (invalidAnalyses.length > 0) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "One or more analyses do not belong to the specified company",
          details: {
            analysisIds: invalidAnalyses.map((a) => a.id),
          },
        },
        { status: 400 }
      );
    }

    const resolvedPersona: AgentPersona = agentPersona ?? "ANALYST";
    const status = body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    const jobId = crypto.randomUUID();

    if (process.env.INNGEST_SIGNING_KEY) {
      try {
        await inngest.send({
          name: "article/generate.requested",
          data: {
            jobId,
            companyId,
            analysisIds,
            agentPersona: resolvedPersona,
            customHeadline,
            authorId: session.user.id,
            status,
          },
        });
      } catch (err) {
        log.error("api.article.inngest_send_failed", { error: String(err) });
      }
    } else {
      log.warn("api.article.inngest_not_configured", {
        jobId,
        reason: "INNGEST_SIGNING_KEY not set — article will not be generated",
      });
    }

    log.info("api.request.accepted", { jobId, agentPersona: resolvedPersona, status });

    return NextResponse.json(
      {
        jobId,
        message: "Article generation queued",
        status,
        agentPersona: resolvedPersona,
      },
      { status: 202 }
    );
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to queue article generation" },
      { status: 500 }
    );
  }
}
