/**
 * Inngest functions for background processing.
 * Runs dual-agent analysis (Analyst + Gossip Girl) sequentially per signal.
 */

import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { generateArticleWithAgent } from "@/lib/ai/agent/article-generator";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "@/lib/ai/agent/personas";
import { logger } from "@/lib/logger";
import type { CrossRefAnalysis } from "@/lib/ai/agent/pipeline";
import type { AgentAnalysis } from "@/lib/ai/agent/types";
import { discoverSignalsFunction } from "./discovery";

export const analyzeSignalFunction = inngest.createFunction(
  {
    id: "analyze-signal",
    triggers: { event: "signal/analysis.requested" },
    retries: 3,
  },
  async ({ event, step }) => {
    const { signalId } = event.data;
    const log = logger.child({ signalId, function: "analyze-signal" });

    log.info("inngest.function.start", { event: event.name });

    // Step 1: Load signal with company
    const signal = await step.run("load-signal", async () => {
      const s = await prisma.signal.findUnique({
        where: { id: signalId },
        include: { company: true },
      });

      if (!s) {
        log.error("inngest.function.signal_not_found", { signalId });
        throw new Error(`Signal not found: ${signalId}`);
      }

      return s;
    });

    // Step 2: Update status to ANALYZING
    await step.run("update-status-analyzing", async () => {
      await prisma.signal.update({
        where: { id: signalId },
        data: { status: "ANALYZING" },
      });
      log.info("inngest.function.status_updated", { status: "ANALYZING" });
    });

    const signalInput = {
      id: signal.id,
      sourceUrl: signal.sourceUrl,
      sourceType: signal.sourceType,
      title: signal.title,
      rawContent: signal.rawContent,
      publishedAt: signal.publishedAt ? new Date(signal.publishedAt) : null,
      scrapedAt: new Date(signal.scrapedAt),
      companyId: signal.companyId,
      status: signal.status,
      company: signal.company
        ? {
            id: signal.company.id,
            name: signal.company.name,
            slug: signal.company.slug,
            ticker: signal.company.ticker,
          }
        : undefined,
    };

    let analystAnalysis: AgentAnalysis | null = null;
    let gossipGirlAnalysis: AgentAnalysis | null = null;

    // Step 3: Run Analyst agent pipeline
    try {
      analystAnalysis = await step.run("run-analyst-agent", async () => {
        return await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
      });

      await step.run("create-analyst-analysis-record", async () => {
        await prisma.analysis.create({
          data: {
            id: analystAnalysis!.id,
            signalId,
            agentPersona: "ANALYST",
            summary: analystAnalysis!.summary,
            keyFacts: analystAnalysis!.keyFacts,
            sentiment: analystAnalysis!.sentiment,
            strategicThemes: analystAnalysis!.strategicThemes,
            confidence: analystAnalysis!.confidence,
            modelUsed: analystAnalysis!.modelUsed,
            analyzedAt: new Date(analystAnalysis!.analyzedAt),
          },
        });
        log.info("inngest.function.analyst_analysis_created", {
          analysisId: analystAnalysis!.id,
          confidence: Math.round(analystAnalysis!.confidence * 1000) / 1000,
        });
      });
    } catch (error) {
      log.error("inngest.function.analyst_agent_failed", { error: String(error) });
    }

    // Step 4: Run Gossip Girl agent pipeline (with cross-reference to Analyst)
    try {
      const crossRefAnalyses: CrossRefAnalysis[] = analystAnalysis
        ? [
            {
              id: analystAnalysis.id,
              agentPersona: analystAnalysis.agentPersona,
              summary: analystAnalysis.summary,
              keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
              sentiment: analystAnalysis.sentiment,
              strategicThemes: analystAnalysis.strategicThemes.map((t) => ({
                label: t.label,
              })),
            },
          ]
        : [];

      gossipGirlAnalysis = await step.run("run-gossip-girl-agent", async () => {
        return await analyzeSignalWithAgent(
          signalInput,
          GOSSIP_GIRL_CONFIG,
          crossRefAnalyses
        );
      });

      await step.run("create-gossip-girl-analysis-record", async () => {
        await prisma.analysis.create({
          data: {
            id: gossipGirlAnalysis!.id,
            signalId,
            agentPersona: "GOSSIP_GIRL",
            summary: gossipGirlAnalysis!.summary,
            keyFacts: gossipGirlAnalysis!.keyFacts,
            sentiment: gossipGirlAnalysis!.sentiment,
            strategicThemes: gossipGirlAnalysis!.strategicThemes,
            confidence: gossipGirlAnalysis!.confidence,
            modelUsed: gossipGirlAnalysis!.modelUsed,
            crossReferences: gossipGirlAnalysis!.crossReferences ?? undefined,
            analyzedAt: new Date(gossipGirlAnalysis!.analyzedAt),
          },
        });
        log.info("inngest.function.gossip_girl_analysis_created", {
          analysisId: gossipGirlAnalysis!.id,
          confidence: Math.round(gossipGirlAnalysis!.confidence * 1000) / 1000,
        });
      });
    } catch (error) {
      log.error("inngest.function.gossip_girl_agent_failed", {
        error: String(error),
      });
    }

    // If both agents failed, mark signal as FAILED
    if (!analystAnalysis && !gossipGirlAnalysis) {
      log.error("inngest.function.both_agents_failed", { signalId });

      await step.run("update-status-failed", async () => {
        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "FAILED" },
        });
        log.info("inngest.function.status_updated", { status: "FAILED" });
      });

      throw new Error(
        `Both agent analyses failed for signal ${signalId}`
      );
    }

    // Step 5: Generate articles for both agents with bidirectional cross-references
    // Both analyses must be complete before generating articles

    // Generate Analyst article (with cross-reference to Gossip Girl if available)
    if (analystAnalysis) {
      try {
        const articleInput = {
          companyId: signal.companyId,
          companyName: signal.company?.name ?? "Unknown",
          analyses: [
            {
              summary: analystAnalysis.summary,
              keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
              sentiment: analystAnalysis.sentiment,
              strategicThemes: analystAnalysis.strategicThemes.map((t) => ({
                label: t.label,
              })),
            },
          ],
        };

        // Add cross-reference to Gossip Girl's analysis if available
        const crossRefForAnalystArticle = gossipGirlAnalysis
          ? [
              {
                summary: gossipGirlAnalysis.summary,
                agentPersona: gossipGirlAnalysis.agentPersona,
                keyFacts: gossipGirlAnalysis.keyFacts.map((f) => f.text),
              },
            ]
          : undefined;

        const articleResult = await step.run(
          "generate-analyst-article",
          async () => {
            return await generateArticleWithAgent(
              articleInput,
              ANALYST_CONFIG,
              crossRefForAnalystArticle
            );
          }
        );

        await step.run("create-analyst-article-record", async () => {
          await prisma.article.create({
            data: {
              title: articleResult.title,
              slug: articleResult.slug,
              summary: articleResult.summary,
              body: articleResult.body,
              companyId: signal.companyId,
              agentPersona: "ANALYST",
              analysisIds: [analystAnalysis!.id],
              status: "PUBLISHED",
            },
          });
          log.info("inngest.function.analyst_article_created", {
            slug: articleResult.slug,
          });
        });
      } catch (error) {
        log.error("inngest.function.analyst_article_failed", {
          error: String(error),
        });
      }
    }

    // Generate Gossip Girl article (with cross-reference to Analyst if available)
    if (gossipGirlAnalysis) {
      try {
        const analysesForArticle = [
          {
            summary: gossipGirlAnalysis.summary,
            keyFacts: gossipGirlAnalysis.keyFacts.map((f) => ({
              text: f.text,
            })),
            sentiment: gossipGirlAnalysis.sentiment,
            strategicThemes: gossipGirlAnalysis.strategicThemes.map((t) => ({
              label: t.label,
            })),
          },
        ];

        const crossRefForArticle = analystAnalysis
          ? [
              {
                summary: analystAnalysis.summary,
                agentPersona: analystAnalysis.agentPersona,
                keyFacts: analystAnalysis.keyFacts.map((f) => f.text),
              },
            ]
          : undefined;

        const articleResult = await step.run(
          "generate-gossip-girl-article",
          async () => {
            return await generateArticleWithAgent(
              {
                companyId: signal.companyId,
                companyName: signal.company?.name ?? "Unknown",
                analyses: analysesForArticle,
              },
              GOSSIP_GIRL_CONFIG,
              crossRefForArticle
            );
          }
        );

        await step.run("create-gossip-girl-article-record", async () => {
          await prisma.article.create({
            data: {
              title: articleResult.title,
              slug: articleResult.slug,
              summary: articleResult.summary,
              body: articleResult.body,
              companyId: signal.companyId,
              agentPersona: "GOSSIP_GIRL",
              analysisIds: [gossipGirlAnalysis!.id],
              status: "PUBLISHED",
            },
          });
          log.info("inngest.function.gossip_girl_article_created", {
            slug: articleResult.slug,
          });
        });
      } catch (error) {
        log.error("inngest.function.gossip_girl_article_failed", {
          error: String(error),
        });
      }
    }

    // Step 7: Update signal status to ANALYZED (at least one agent succeeded)
    await step.run("update-status-analyzed", async () => {
      await prisma.signal.update({
        where: { id: signalId },
        data: { status: "ANALYZED" },
      });
      log.info("inngest.function.status_updated", { status: "ANALYZED" });
    });

    log.info("inngest.function.complete", {
      signalId,
      analystAnalysisId: analystAnalysis?.id ?? null,
      gossipGirlAnalysisId: gossipGirlAnalysis?.id ?? null,
    });

    return {
      success: true,
      signalId,
      analystAnalysisId: analystAnalysis?.id ?? null,
      gossipGirlAnalysisId: gossipGirlAnalysis?.id ?? null,
    };
  }
);

export const functions = [analyzeSignalFunction, discoverSignalsFunction];
