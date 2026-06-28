/**
 * Inngest function for background article generation.
 *
 * Task 4.3 — moves synchronous article generation out of the API route
 * so the endpoint can return 202 Accepted immediately.
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AgentPersona } from "@prisma/client";
import { generateArticle } from "@/lib/ai/article-generator";
import { generateArticleWithAgent } from "@/lib/ai/agent/article-generator";
import { getAgentConfig } from "@/lib/ai/agent/personas";

export const generateArticleFunction = inngest.createFunction(
  {
    id: "generate-article",
    triggers: { event: "article/generate.requested" },
    retries: 2,
    timeouts: { finish: "5m" },
  },
  async ({ event, step }) => {
    const {
      jobId,
      companyId,
      analysisIds,
      agentPersona,
      customHeadline,
      authorId,
      status,
    } = event.data as {
      jobId: string;
      companyId: string;
      analysisIds: string[];
      agentPersona: AgentPersona;
      customHeadline?: string;
      authorId: string;
      status: "DRAFT" | "PUBLISHED";
    };

    const log = logger.child({ jobId, function: "generate-article" });
    log.info("inngest.article.start", { companyId, analysisIds, agentPersona });

    // Step 1: Load company + analyses
    const ctx = await step.run("load-article-context", async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        throw new NonRetriableError(`Company not found: ${companyId}`);
      }

      const analyses = await prisma.analysis.findMany({
        where: { id: { in: analysisIds } },
        include: { signal: true },
      });
      if (analyses.length !== analysisIds.length) {
        throw new NonRetriableError(
          `Analysis count mismatch: expected ${analysisIds.length}, got ${analyses.length}`
        );
      }

      const invalidAnalyses = analyses.filter((a) => a.signal.companyId !== companyId);
      if (invalidAnalyses.length > 0) {
        throw new NonRetriableError(
          `Analyses do not belong to company ${companyId}: ${invalidAnalyses.map((a) => a.id).join(", ")}`
        );
      }

      return { company, analyses };
    });

    const analysesForGeneration = ctx.analyses.map((a) => ({
      summary: a.summary,
      keyFacts: (a.keyFacts as Array<{ text: string }>) || [],
      sentiment: a.sentiment,
      strategicThemes: (a.strategicThemes as Array<{ label: string }>) || [],
    }));

    // Step 2: Generate article content
    const article = await step.run("generate-article-content", async () => {
      if (agentPersona) {
        const agentConfig = getAgentConfig(agentPersona);

        const crossRefAnalyses = await prisma.analysis.findMany({
          where: {
            signalId: { in: ctx.analyses.map((a) => a.signalId) },
            agentPersona: { not: agentPersona },
          },
        });

        const crossRefs = crossRefAnalyses.map((a) => ({
          summary: a.summary,
          agentPersona: a.agentPersona,
          keyFacts: ((a.keyFacts as Array<{ text: string }>) || []).map((f) => f.text),
        }));

        return await generateArticleWithAgent(
          {
            companyId,
            companyName: ctx.company.name,
            analyses: analysesForGeneration,
          },
          agentConfig,
          crossRefs.length > 0 ? crossRefs : undefined
        );
      }

      return await generateArticle({
        companyId,
        companyName: ctx.company.name,
        analyses: analysesForGeneration,
      });
    });

    // Step 3: Persist article record
    const dbArticle = await step.run("persist-article-record", async () => {
      return await prisma.article.create({
        data: {
          title: customHeadline || article.title,
          slug: article.slug,
          summary: article.summary,
          body: article.body,
          companyId,
          agentPersona,
          analysisIds,
          status,
          authorId,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
        },
      });
    });

    log.info("inngest.article.complete", {
      articleId: dbArticle.id,
      agentPersona,
      status,
    });

    return {
      jobId,
      articleId: dbArticle.id,
      slug: dbArticle.slug,
      status: dbArticle.status,
    };
  }
);

export const articleFunctions = [generateArticleFunction];
