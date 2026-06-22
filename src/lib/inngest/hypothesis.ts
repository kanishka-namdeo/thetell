/**
 * Weekly hypothesis generation function.
 *
 * Runs every Monday at 3:00 AM UTC to generate/update investigative
 * hypotheses for all tracked companies based on recent analyses and themes.
 */

import { inngest } from "./client";
import { cron } from "inngest";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateHypotheses } from "@/lib/ai/hypothesis-generator";
import type { RecentAnalysis, ThemeWithMomentum } from "@/lib/ai/hypothesis-generator";

export const generateHypothesesFunction = inngest.createFunction(
  {
    id: "generate-hypotheses",
    triggers: [cron("0 3 * * 1")], // Monday 3:00 AM UTC
    retries: 2,
  },
  async ({ step }) => {
    const log = logger.child({ function: "generate-hypotheses" });
    log.info("hypothesis_generation.start");

    // Step 1: Get all companies with at least one signal
    const companies = await step.run("load-tracked-companies", async () => {
      return await prisma.company.findMany({
        where: {
          signals: { some: {} },
        },
        select: {
          id: true,
          name: true,
        },
      });
    });

    log.info("hypothesis_generation.companies_loaded", {
      count: companies.length,
    });

    if (companies.length === 0) {
      log.info("hypothesis_generation.no_companies");
      return { success: true, companiesProcessed: 0, hypothesesCreated: 0 };
    }

    let totalHypotheses = 0;

    // Step 2: For each company, generate hypotheses
    for (const company of companies) {
      try {
        const result = await step.run(
          `generate-hypotheses-${company.name.slice(0, 20)}`,
          async () => {
            const companyLog = log.child({ companyId: company.id, companyName: company.name });

            // Load recent analyses (last 14 days)
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            const analyses = await prisma.analysis.findMany({
              where: {
                signal: { companyId: company.id },
                analyzedAt: { gte: fourteenDaysAgo },
                confidence: { gte: 0.4 },
              },
              select: {
                signalId: true,
                summary: true,
                keyFacts: true,
                strategicThemes: true,
                sentiment: true,
                confidence: true,
                signal: {
                  select: { sourceType: true },
                },
              },
              orderBy: { analyzedAt: "desc" },
              take: 30,
            });

            // Map analyses to the generator input shape
            const recentAnalyses: RecentAnalysis[] = analyses.map((a) => ({
              signalId: a.signalId,
              summary: a.summary,
              keyFacts: Array.isArray(a.keyFacts)
                ? (a.keyFacts as Array<{ text: string }>)
                : [],
              strategicThemes: Array.isArray(a.strategicThemes)
                ? (a.strategicThemes as Array<{ label: string }>)
                : [],
              sentiment: a.sentiment,
              confidence: a.confidence,
              sourceType: a.signal.sourceType,
            }));

            // Load current themes with momentum
            const themes = await prisma.signalTheme.findMany({
              where: { companyId: company.id },
              select: {
                id: true,
                label: true,
                momentum: true,
                status: true,
              },
              orderBy: { momentum: "desc" },
              take: 15,
            });

            const themeInputs: ThemeWithMomentum[] = themes.map((t) => ({
              id: t.id,
              label: t.label,
              momentum: t.momentum,
              status: t.status,
            }));

            companyLog.info("hypothesis_generation.data_loaded", {
              analysisCount: recentAnalyses.length,
              themeCount: themeInputs.length,
            });

            // Generate hypotheses via LLM
            const hypotheses = await generateHypotheses(
              company.id,
              company.name,
              recentAnalyses,
              themeInputs
            );

            if (hypotheses.length === 0) {
              companyLog.info("hypothesis_generation.no_hypotheses");
              return { companyId: company.id, created: 0 };
            }

            // Archive existing ACTIVE hypotheses for this company
            await prisma.companyHypothesis.updateMany({
              where: { companyId: company.id, status: "ACTIVE" },
              data: { status: "ARCHIVED" },
            });

            // Upsert new hypotheses
            let created = 0;
            for (const h of hypotheses) {
              await prisma.companyHypothesis.create({
                data: {
                  companyId: company.id,
                  title: h.question,
                  description: h.rationale,
                  status: "ACTIVE",
                  confidence: h.priority,
                  evidence: JSON.stringify({
                    sourceWeights: h.sourceWeights,
                    priority: h.priority,
                    generatedAt: new Date().toISOString(),
                  }),
                },
              });
              created++;
            }

            companyLog.info("hypothesis_generation.completed", { created });
            return { companyId: company.id, created };
          }
        );

        totalHypotheses += result.created;
      } catch (error) {
        log.error("hypothesis_generation.company_failed", {
          companyId: company.id,
          companyName: company.name,
          error: String(error),
        });
      }
    }

    log.info("hypothesis_generation.complete", {
      companiesProcessed: companies.length,
      hypothesesCreated: totalHypotheses,
    });

    return {
      success: true,
      companiesProcessed: companies.length,
      hypothesesCreated: totalHypotheses,
    };
  }
);

export const hypothesisFunctions = [generateHypothesesFunction];
