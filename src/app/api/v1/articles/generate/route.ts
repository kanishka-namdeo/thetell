import { NextRequest, NextResponse } from "next/server";
import { AgentPersona } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateArticle } from "@/lib/ai/article-generator";
import { generateArticleWithAgent } from "@/lib/ai/agent/article-generator";
import { getAgentConfig } from "@/lib/ai/agent/personas";

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

    const analysesForGeneration = analyses.map((a) => ({
      summary: a.summary,
      keyFacts: (a.keyFacts as Array<{ text: string }>) || [],
      sentiment: a.sentiment,
      strategicThemes: (a.strategicThemes as Array<{ label: string }>) || [],
    }));

    const resolvedPersona: AgentPersona = agentPersona ?? "ANALYST";
    let article: { title: string; slug: string; summary: string; body: string };

    if (agentPersona) {
      const agentConfig = getAgentConfig(agentPersona);

      const crossRefAnalyses = await prisma.analysis.findMany({
        where: {
          signalId: { in: analyses.map((a) => a.signalId) },
          agentPersona: { not: agentPersona },
        },
      });

      const crossRefs = crossRefAnalyses.map((a) => ({
        summary: a.summary,
        agentPersona: a.agentPersona,
        keyFacts: ((a.keyFacts as Array<{ text: string }>) || []).map((f) => f.text),
      }));

      article = await generateArticleWithAgent(
        { companyId, companyName: company.name, analyses: analysesForGeneration },
        agentConfig,
        crossRefs.length > 0 ? crossRefs : undefined
      );
    } else {
      article = await generateArticle({
        companyId,
        companyName: company.name,
        analyses: analysesForGeneration,
      });
    }

    const status = body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

    const dbArticle = await prisma.article.create({
      data: {
        title: customHeadline || article.title,
        slug: article.slug,
        summary: article.summary,
        body: article.body,
        companyId,
        agentPersona: resolvedPersona,
        analysisIds: analysisIds,
        status,
        authorId: session.user.id,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });

    log.info("api.request.success", { articleId: dbArticle.id, agentPersona: resolvedPersona });

    return NextResponse.json(dbArticle, { status: 201 });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to generate article" },
      { status: 500 }
    );
  }
}
