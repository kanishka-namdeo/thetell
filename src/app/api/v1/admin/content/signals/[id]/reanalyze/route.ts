import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "@/lib/ai/agent/personas";
import { extractSentimentLabel } from "@/lib/ai/agent/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/content/signals/[id]/reanalyze" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    log.info("admin.content.signal.reanalyze.start", { signalId: id });

    const signal = await prisma.signal.findUnique({
      where: { id },
      include: {
        company: true,
        analyses: true,
      },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    await prisma.signal.update({
      where: { id },
      data: { status: "ANALYZING" },
    });

    try {
      const signalInput = {
        id: signal.id,
        sourceUrl: signal.sourceUrl,
        sourceType: signal.sourceType,
        title: signal.title,
        rawContent: signal.rawContent,
        publishedAt: signal.publishedAt,
        scrapedAt: signal.scrapedAt,
        companyId: signal.companyId,
        status: signal.status,
        company: {
          id: signal.company.id,
          name: signal.company.name,
          slug: signal.company.slug,
          ticker: signal.company.ticker,
        },
      };

      const analystAnalysis = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
      const analystSentimentLabel = extractSentimentLabel(analystAnalysis);

      await prisma.analysis.upsert({
        where: {
          signalId_agentPersona: {
            signalId: signal.id,
            agentPersona: "ANALYST",
          },
        },
        update: {
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts,
          sentiment: analystSentimentLabel,
          sentimentData: analystAnalysis.sentiment,
          strategicThemes: analystAnalysis.strategicThemes,
          confidence: analystAnalysis.confidence,
          modelUsed: analystAnalysis.modelUsed,
          analyzedAt: new Date(analystAnalysis.analyzedAt),
        },
        create: {
          id: analystAnalysis.id,
          signalId: signal.id,
          agentPersona: "ANALYST",
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts,
          sentiment: analystSentimentLabel,
          sentimentData: analystAnalysis.sentiment,
          strategicThemes: analystAnalysis.strategicThemes,
          confidence: analystAnalysis.confidence,
          modelUsed: analystAnalysis.modelUsed,
          analyzedAt: new Date(analystAnalysis.analyzedAt),
        },
      });

      const gossipGirlAnalysis = await analyzeSignalWithAgent(
        signalInput,
        GOSSIP_GIRL_CONFIG,
        [
          {
            id: analystAnalysis.id,
            agentPersona: analystAnalysis.agentPersona,
            summary: analystAnalysis.summary,
            keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
            sentiment: analystSentimentLabel,
            strategicThemes: analystAnalysis.strategicThemes.map((t) => ({
              label: t.label,
            })),
          },
        ]
      );

      const gossipSentimentLabel = extractSentimentLabel(gossipGirlAnalysis);

      await prisma.analysis.upsert({
        where: {
          signalId_agentPersona: {
            signalId: signal.id,
            agentPersona: "GOSSIP_GIRL",
          },
        },
        update: {
          summary: gossipGirlAnalysis.summary,
          keyFacts: gossipGirlAnalysis.keyFacts,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipGirlAnalysis.sentiment,
          strategicThemes: gossipGirlAnalysis.strategicThemes,
          confidence: gossipGirlAnalysis.confidence,
          modelUsed: gossipGirlAnalysis.modelUsed,
          crossReferences: gossipGirlAnalysis.crossReferences ?? undefined,
          analyzedAt: new Date(gossipGirlAnalysis.analyzedAt),
        },
        create: {
          id: gossipGirlAnalysis.id,
          signalId: signal.id,
          agentPersona: "GOSSIP_GIRL",
          summary: gossipGirlAnalysis.summary,
          keyFacts: gossipGirlAnalysis.keyFacts,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipGirlAnalysis.sentiment,
          strategicThemes: gossipGirlAnalysis.strategicThemes,
          confidence: gossipGirlAnalysis.confidence,
          modelUsed: gossipGirlAnalysis.modelUsed,
          crossReferences: gossipGirlAnalysis.crossReferences ?? undefined,
          analyzedAt: new Date(gossipGirlAnalysis.analyzedAt),
        },
      });

      await prisma.signal.update({
        where: { id },
        data: { status: "ANALYZED" },
      });

      await logAuditEvent({
        userId: session.user.id,
        action: "content.signal.reanalyze",
        resource: "signal",
        resourceId: id,
        details: { success: true },
        request,
      });

      log.info("admin.content.signal.reanalyze.success", { signalId: id });

      return NextResponse.json({ success: true, message: "Signal re-analyzed successfully" });
    } catch (err) {
      logger.error("Re-analysis failed", { error: String(err) });
      await prisma.signal.update({
        where: { id },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        { error: "analysis_failed", message: "Failed to re-analyze signal" },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error("admin.content.signal.reanalyze.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to re-analyze signal" },
      { status: 500 }
    );
  }
}
