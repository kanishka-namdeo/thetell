/**
 * Inngest functions for background processing.
 * Runs dual-agent analysis (Analyst + Gossip Girl) sequentially per signal.
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { generateArticleWithAgent } from "@/lib/ai/agent/article-generator";
import { generateClusterArticle } from "@/lib/ai/agent/cluster-article-generator";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG, isPreferredSourceType } from "@/lib/ai/agent/personas";
import { logger } from "@/lib/logger";
import type { CrossRefAnalysis } from "@/lib/ai/agent/pipeline";
import type { AgentAnalysis } from "@/lib/ai/agent/types";
import { extractSentimentLabel } from "@/lib/ai/agent/types";
import type { ZodError } from "zod";
import { discoverSignalsUnifiedFunction } from "./signal-discovery";
import { correlateSignalsFunction } from "./correlation";
import { calibrateInferencesFunction } from "./calibration";
import { sourceHealthCheckFunction } from "./source-health";
import { generateArticleFunction } from "./articles";
import { mergeClustersFunction } from "./cluster-merge";
import { detectLanguage, LANGUAGE_CONFIDENCE_THRESHOLD } from "@/lib/nlp";
import { assessContentQuality } from "@/lib/nlp";
import { invalidateClusterCacheForCompany } from "@/lib/cache/cluster-cache";
import { invalidateClusterMetrics } from "@/lib/metrics/cluster-metrics";
import { clusterPerformanceMetrics } from "@/lib/metrics/cluster-performance-metrics";
import { triageSignalToCluster } from "@/lib/nlp/cluster-triage";
import { loadSignalEmbedding } from "@/lib/nlp/embedding-store";
import { analyzeSignalForCluster } from "@/lib/ai/agent/cluster-analysis";
import { updateClusterWithSignal } from "@/lib/ai/agent/cluster-update";
import { AUDIT_ACTIONS, logAuditEvent } from "@/lib/audit-logger";

export const analyzeSignalFunction = inngest.createFunction(
  {
    id: "analyze-signal",
    triggers: { event: "signal/analysis.requested" },
    retries: 3,
    timeouts: {
      finish: "10m",
    },
  },
  async ({ event, step }) => {
    const { signalId } = event.data;

    if (!signalId || typeof signalId !== "string") {
      throw new NonRetriableError(
        `signal/analysis.requested event missing signalId, got: ${JSON.stringify(event.data)}`
      );
    }

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
        throw new NonRetriableError(`Signal not found: ${signalId}`);
      }

      return s;
    });

    // Step 2: Detect language (Task 3.1)
    const languageCheck = await step.run("detect-language", async () => {
      try {
        const result = await detectLanguage(signal.rawContent);
        log.info("inngest.function.language_detected", {
          language: result.language,
          confidence: result.confidence,
        });
        return result;
      } catch (error) {
        log.warn("inngest.function.language_detection_failed", {
          error: String(error),
          fallback: "assuming English",
        });
        return { language: "en", confidence: 1.0 };
      }
    });

    // Step 3: Check if non-English
    if (
      languageCheck.language !== "en" ||
      languageCheck.confidence < LANGUAGE_CONFIDENCE_THRESHOLD
    ) {
      log.info("inngest.function.non_english_skipped", {
        language: languageCheck.language,
        confidence: languageCheck.confidence,
      });

      await step.run("update-status-non-english", async () => {
        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "NON_ENGLISH" },
        });
      });

      return {
        success: false,
        signalId,
        reason: "NON_ENGLISH",
        language: languageCheck.language,
      };
    }

    // Step 4: Assess content quality (Task 3.3)
    const qualityCheck = await step.run("assess-quality", async () => {
      try {
        const companyName = signal.company?.name ?? "";
        const result = await assessContentQuality(signal.rawContent, companyName);
        log.info("inngest.function.quality_assessed", {
          score: result.score,
          pass: result.pass,
          reasons: result.reasons,
        });
        return result;
      } catch (error) {
        log.warn("inngest.function.quality_assessment_failed", {
          error: String(error),
          fallback: "allowing through",
        });
        return { score: 0.5, pass: true, reasons: ["Quality check failed, defaulting to pass"] };
      }
    });

    // Step 5: Check if low quality
    if (!qualityCheck.pass) {
      log.info("inngest.function.low_quality_skipped", {
        score: qualityCheck.score,
        reasons: qualityCheck.reasons,
      });

      await step.run("update-status-low-quality", async () => {
        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "LOW_QUALITY" },
        });
      });

      return {
        success: false,
        signalId,
        reason: "LOW_QUALITY",
        score: qualityCheck.score,
      };
    }

    // Step 6: Update status to ANALYZING
    await step.run("update-status-analyzing", async () => {
      await prisma.signal.update({
        where: { id: signalId },
        data: { status: "ANALYZING" },
      });
      log.info("inngest.function.status_updated", { status: "ANALYZING" });
    });

    // Build signalInput early so it's available for both cluster and standalone paths
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

    // Step 6.5: Triage - check if signal belongs to an existing cluster
    const triageResult = await step.run("triage-cluster", async () => {
      try {
        // Check if cluster routing is enabled
        const config = await prisma.systemConfig.findFirst();
        const clusterRoutingEnabled = config?.clusterRoutingEnabled ?? false;

        if (!clusterRoutingEnabled) {
          log.info("inngest.function.cluster_routing_disabled");
          return { matched: false, cluster: null, method: "disabled" as const, candidates: 0 };
        }

        // Load signal embedding via raw query (pgvector column is Unsupported in Prisma)
        const embeddingArray = await loadSignalEmbedding(signalId);

        if (!embeddingArray) {
          log.info("inngest.function.no_embedding_for_triage");
          return { matched: false, cluster: null, method: "no_embedding" as const, candidates: 0 };
        }

        const threshold = config?.clusterMatchThreshold ?? 0.75;

        const result = await triageSignalToCluster(signal.companyId, embeddingArray, {
          threshold,
        });

        log.info("inngest.function.triage_complete", {
          matched: result.matched,
          clusterId: result.cluster?.themeId,
          similarity: result.cluster?.similarity,
          method: result.method,
        });

        return result;
      } catch (error) {
        log.error("inngest.function.triage_failed", { error: String(error) });
        return { matched: false, cluster: null, method: "error" as const, candidates: 0 };
      }
    });

    // Step 7: Route to cluster or standalone analysis
    if (triageResult.matched && triageResult.cluster) {
      // CLUSTER PATH: Lightweight analysis for signals matching existing clusters
      log.info("inngest.function.cluster_path_start", {
        clusterId: triageResult.cluster.themeId,
        clusterLabel: triageResult.cluster.label,
        similarity: triageResult.cluster.similarity,
      });

      try {
        // Run lightweight cluster analysis for both agents
        const clusterAnalysis = await step.run("run-cluster-analysis", async () => {
          const analystResult = await analyzeSignalForCluster(
            signalInput,
            {
              label: triageResult.cluster!.label,
              summary: null, // Will be loaded in updateClusterWithSignal
              signalCount: 0, // Will be loaded in updateClusterWithSignal
              existingThemes: [],
            },
            "ANALYST"
          );

          const gossipResult = await analyzeSignalForCluster(
            signalInput,
            {
              label: triageResult.cluster!.label,
              summary: null,
              signalCount: 0,
              existingThemes: [],
            },
            "GOSSIP_GIRL"
          );

          return { analyst: analystResult, gossip: gossipResult };
        });

        // Update cluster with new signal
        const updateResult = await step.run("update-cluster-with-signal", async () => {
          return await updateClusterWithSignal(
            triageResult.cluster!.themeId,
            signalId,
            clusterAnalysis.analyst,
            { id: signal.companyId, name: signal.company?.name ?? "Unknown" }
          );
        });

        // Log audit event
        await step.run("log-cluster-assignment", async () => {
          await logAuditEvent({
            userId: "system",
            action: AUDIT_ACTIONS.CLUSTER_SIGNAL_ASSIGNED,
            resource: "signal",
            resourceId: signalId,
            details: {
              clusterId: triageResult.cluster!.themeId,
              clusterLabel: triageResult.cluster!.label,
              similarity: triageResult.cluster!.similarity,
              novelFactsAdded: updateResult.novelFactsAdded,
              novelThemesAdded: updateResult.novelThemesAdded,
            },
          });
        });

        // Generate cluster articles if threshold crossed
        if (updateResult.regenerateArticle) {
          await step.run("regenerate-cluster-articles", async () => {
            const cluster = await prisma.signalTheme.findUnique({
              where: { id: triageResult.cluster!.themeId },
              include: {
                clusteredSignals: {
                  select: {
                    id: true,
                    title: true,
                    sourceType: true,
                    analyses: { select: { keyFacts: true } },
                  },
                },
                company: { select: { name: true, ticker: true } },
              },
            });

            if (!cluster) return;

            const clusterData = {
              label: cluster.label,
              summary: cluster.description || cluster.label,
              signals: cluster.clusteredSignals.map((s) => ({
                id: s.id,
                title: s.title,
                sourceType: s.sourceType,
                facts: s.analyses.flatMap((a) =>
                  Array.isArray(a.keyFacts)
                    ? a.keyFacts.map((f) =>
                        typeof f === "string" ? f : (f && typeof f === "object" && "text" in f ? f.text : String(f))
                      )
                    : []
                ) as Array<string | { text?: string }>,
              })),
            };

            const companyInfo = {
              name: cluster.company.name,
              ticker: cluster.company.ticker || undefined,
            };

            for (const [persona, config] of [
              ["ANALYST", ANALYST_CONFIG],
              ["GOSSIP_GIRL", GOSSIP_GIRL_CONFIG],
            ] as const) {
              try {
                const article = await generateClusterArticle(clusterData, companyInfo, config);

                await prisma.clusterArticle.upsert({
                  where: {
                    themeId_agentPersona: {
                      themeId: cluster.id,
                      agentPersona: persona,
                    },
                  },
                  update: {
                    title: article.title,
                    slug: article.slug,
                    summary: article.summary,
                    body: article.body,
                    signalCount: updateResult.newSignalCount,
                    status: "PUBLISHED",
                    publishedAt: new Date(),
                  },
                  create: {
                    themeId: cluster.id,
                    companyId: cluster.companyId,
                    title: article.title,
                    slug: article.slug,
                    summary: article.summary,
                    body: article.body,
                    agentPersona: persona,
                    signalCount: updateResult.newSignalCount,
                    status: "PUBLISHED",
                    publishedAt: new Date(),
                  },
                });

                await logAuditEvent({
                  userId: "system",
                  action: AUDIT_ACTIONS.CLUSTER_ARTICLE_GENERATED,
                  resource: "cluster_article",
                  resourceId: cluster.id,
                  details: { persona, signalCount: updateResult.newSignalCount },
                });

                log.info("inngest.function.cluster_article_regenerated", {
                  clusterId: cluster.id,
                  persona,
                  signalCount: updateResult.newSignalCount,
                });
              } catch (error) {
                log.error("inngest.function.cluster_article_generation_failed", {
                  clusterId: cluster.id,
                  persona,
                  error: String(error),
                });
              }
            }
          });
        }

        // Generate cross-signal debate for the cluster
        if (updateResult.regenerateArticle) {
          await step.run("generate-cluster-debate", async () => {
            const cluster = await prisma.signalTheme.findUnique({
              where: { id: triageResult.cluster!.themeId },
              include: {
                clusteredSignals: {
                  select: { id: true, title: true, sourceType: true, publishedAt: true, engagement: true },
                },
                company: { select: { name: true } },
              },
            });

            if (!cluster || cluster.clusteredSignals.length < 2) return;

            // Build signal metadata map for WeightedAnalysis construction
            const signalMeta = new Map(cluster.clusteredSignals.map(s => [s.id, s]));

            // Load all analyses from cluster signals
            const analyses = await prisma.analysis.findMany({
              where: {
                signalId: { in: cluster.clusteredSignals.map(s => s.id) },
              },
              select: {
                id: true,
                signalId: true,
                agentPersona: true,
                summary: true,
                keyFacts: true,
                sentiment: true,
                sentimentData: true,
                strategicThemes: true,
                confidence: true,
                crossReferences: true,
                modelUsed: true,
                analyzedAt: true,
                sourceMatchPreference: true,
              },
            });

            // Separate by persona and construct WeightedAnalysis objects
            const analystAnalyses = analyses
              .filter(a => a.agentPersona === "ANALYST")
              .map(a => {
                const sig = signalMeta.get(a.signalId);
                return {
                  id: a.id,
                  signalId: a.signalId,
                  agentPersona: "ANALYST" as const,
                  summary: a.summary || "",
                  keyFacts: (a.keyFacts || []) as import("@/lib/ai/agent/types").AnalystFact[],
                  sentiment: (a.sentimentData || { sentiment: a.sentiment, confidence: a.confidence, key_phrases: [] }) as import("@/lib/ai/agent/types").AnalystSentiment,
                  strategicThemes: (a.strategicThemes || []) as import("@/lib/ai/agent/types").AnalystTheme[],
                  confidence: a.confidence,
                  crossReferences: a.crossReferences as Array<{ analysisId: string; agentPersona: "ANALYST" | "GOSSIP_GIRL"; connection: string }> | null,
                  modelUsed: a.modelUsed,
                  analyzedAt: a.analyzedAt,
                  sourceMatchPreference: a.sourceMatchPreference,
                  sourceType: sig?.sourceType,
                  engagement: sig?.engagement as Record<string, unknown> | null,
                  signalTitle: sig?.title,
                  publishedAt: sig?.publishedAt,
                };
              });

            const gossipAnalyses = analyses
              .filter(a => a.agentPersona === "GOSSIP_GIRL")
              .map(a => {
                const sig = signalMeta.get(a.signalId);
                return {
                  id: a.id,
                  signalId: a.signalId,
                  agentPersona: "GOSSIP_GIRL" as const,
                  summary: a.summary || "",
                  keyFacts: (a.keyFacts || []) as import("@/lib/ai/agent/types").GossipFact[],
                  sentiment: (a.sentimentData || { surface_reading: "neutral-surface" as const, tell_strength: a.confidence, key_phrases: [] }) as import("@/lib/ai/agent/types").GossipSentiment,
                  strategicThemes: (a.strategicThemes || []) as import("@/lib/ai/agent/types").GossipTheme[],
                  confidence: a.confidence,
                  crossReferences: a.crossReferences as Array<{ analysisId: string; agentPersona: "ANALYST" | "GOSSIP_GIRL"; connection: string }> | null,
                  modelUsed: a.modelUsed,
                  analyzedAt: a.analyzedAt,
                  sourceMatchPreference: a.sourceMatchPreference,
                  sourceType: sig?.sourceType,
                  engagement: sig?.engagement as Record<string, unknown> | null,
                  signalTitle: sig?.title,
                  publishedAt: sig?.publishedAt,
                };
              });

            if (analystAnalyses.length === 0 && gossipAnalyses.length === 0) return;

            try {
              const { generateCrossSignalDebate } = await import("@/lib/ai/agent/cross-signal-debate");
              const debateResult = await generateCrossSignalDebate(
                analystAnalyses,
                gossipAnalyses,
                triageResult.cluster!.label,
                cluster.company.name
              );

              // Delete any existing cluster debate
              await prisma.agentDebate.deleteMany({
                where: { clusterId: triageResult.cluster!.themeId },
              });

              // Create new cluster debate (signalId is required but we'll use the current signal)
              await prisma.agentDebate.create({
                data: {
                  signalId,
                  clusterId: triageResult.cluster!.themeId,
                  analystPosition: debateResult.debate.analystPosition,
                  gossipGirlPosition: debateResult.debate.gossipGirlPosition,
                  pointsOfAgreement: debateResult.debate.pointsOfAgreement,
                  pointsOfContention: debateResult.debate.pointsOfContention,
                  synthesis: debateResult.debate.synthesis,
                },
              });

              log.info("inngest.function.cluster_debate_generated", {
                clusterId: triageResult.cluster!.themeId,
                analystCount: analystAnalyses.length,
                gossipCount: gossipAnalyses.length,
              });
            } catch (error) {
              log.error("inngest.function.cluster_debate_failed", {
                clusterId: triageResult.cluster!.themeId,
                error: String(error),
              });
            }
          });
        }

        // Update signal status to ANALYZED
        await step.run("update-status-analyzed-cluster", async () => {
          await prisma.signal.update({
            where: { id: signalId },
            data: { status: "ANALYZED" },
          });
          log.info("inngest.function.status_updated", { status: "ANALYZED", path: "cluster" });
        });

        log.info("inngest.function.cluster_path_complete", {
          signalId,
          clusterId: triageResult.cluster.themeId,
          novelFacts: updateResult.novelFactsAdded,
          novelThemes: updateResult.novelThemesAdded,
          articleRegenerated: updateResult.regenerateArticle,
        });

        return {
          success: true,
          signalId,
          path: "cluster",
          clusterId: triageResult.cluster.themeId,
        };
      } catch (error) {
        log.error("inngest.function.cluster_path_failed", {
          signalId,
          clusterId: triageResult.cluster.themeId,
          error: String(error),
        });
        // Fall through to standalone path
      }
    }

    // STANDALONE PATH: Full dual-agent analysis for signals not matching any cluster
    log.info("inngest.function.standalone_path_start");

    let analystAnalysis: AgentAnalysis | null = null;
    let gossipGirlAnalysis: AgentAnalysis | null = null;

    // Step 3: Run Analyst agent pipeline
    try {
      analystAnalysis = await step.run("run-analyst-agent", async () => {
        return await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
      });

      // Extract simple sentiment label for DB enum field
      const analystSentimentLabel = extractSentimentLabel(analystAnalysis!);

      await step.run("create-analyst-analysis-record", async () => {
        await prisma.analysis.upsert({
          where: {
            signalId_agentPersona: { signalId, agentPersona: "ANALYST" },
          },
          update: {
            summary: analystAnalysis!.summary,
            keyFacts: analystAnalysis!.keyFacts,
            sentiment: analystSentimentLabel,
            sentimentData: analystAnalysis!.sentiment,
            strategicThemes: analystAnalysis!.strategicThemes,
            confidence: analystAnalysis!.confidence,
            modelUsed: analystAnalysis!.modelUsed,
            analyzedAt: new Date(analystAnalysis!.analyzedAt),
            sourceMatchPreference: isPreferredSourceType(signal.sourceType, ANALYST_CONFIG),
          },
          create: {
            id: analystAnalysis!.id,
            signalId,
            agentPersona: "ANALYST",
            summary: analystAnalysis!.summary,
            keyFacts: analystAnalysis!.keyFacts,
            sentiment: analystSentimentLabel,
            sentimentData: analystAnalysis!.sentiment,
            strategicThemes: analystAnalysis!.strategicThemes,
            confidence: analystAnalysis!.confidence,
            modelUsed: analystAnalysis!.modelUsed,
            analyzedAt: new Date(analystAnalysis!.analyzedAt),
            sourceMatchPreference: isPreferredSourceType(signal.sourceType, ANALYST_CONFIG),
          },
        });
        log.info("inngest.function.analyst_analysis_created", {
          analysisId: analystAnalysis!.id,
          confidence: Math.round(analystAnalysis!.confidence * 1000) / 1000,
        });
      });
    } catch (error) {
      // Enhanced error logging to capture full stack trace and context
      const errorRecord: Record<string, unknown> = {};
      
      if (error instanceof Error) {
        errorRecord.name = error.name;
        errorRecord.message = error.message;
        errorRecord.stack = error.stack;
        
        // Capture Zod validation errors
        if (error.name === 'ZodError' && 'issues' in error) {
          try {
            errorRecord.zodErrors = JSON.stringify((error as ZodError).issues);
          } catch {
            errorRecord.zodErrors = 'Failed to serialize Zod errors';
          }
        }
        
        // Capture OpenAI API errors  
        if (error.constructor.name.includes('OpenAI') || error.constructor.name.includes('API')) {
          errorRecord.errorType = error.constructor.name;
          // Use type assertion to access OpenAI error properties
          const apiError = error as { status?: number; code?: string };
          if (apiError.status !== undefined) errorRecord.status = apiError.status;
          if (apiError.code !== undefined) errorRecord.code = apiError.code;
        }
      } else {
        errorRecord.error = String(error);
      }
      
      log.error("inngest.function.analyst_agent_failed", errorRecord);
      
      // Also check if env vars are available
      log.error("inngest.function.env_check", {
        hasApiKey: !!process.env.API_KEY,
        hasBaseUrl: !!process.env.BASE_URL,
        hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      });
    }

    // Step 4: Run Gossip Girl agent pipeline (with cross-reference to Analyst)
    try {
      // Extract simple sentiment label for cross-reference
      const analystSentimentForCrossRef = analystAnalysis
        ? ("sentiment" in analystAnalysis.sentiment
          ? analystAnalysis.sentiment.sentiment
          : "NEUTRAL")
        : "NEUTRAL";

      const crossRefAnalyses: CrossRefAnalysis[] = analystAnalysis
        ? [
            {
              id: analystAnalysis.id,
              agentPersona: analystAnalysis.agentPersona,
              summary: analystAnalysis.summary,
              keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
              sentiment: analystSentimentForCrossRef,
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

      // Extract simple sentiment label for DB enum field
      const gossipSentimentLabel = extractSentimentLabel(gossipGirlAnalysis!);

      await step.run("create-gossip-girl-analysis-record", async () => {
        await prisma.analysis.upsert({
          where: {
            signalId_agentPersona: { signalId, agentPersona: "GOSSIP_GIRL" },
          },
          update: {
            summary: gossipGirlAnalysis!.summary,
            keyFacts: gossipGirlAnalysis!.keyFacts,
            sentiment: gossipSentimentLabel,
            sentimentData: gossipGirlAnalysis!.sentiment,
            strategicThemes: gossipGirlAnalysis!.strategicThemes,
            confidence: gossipGirlAnalysis!.confidence,
            modelUsed: gossipGirlAnalysis!.modelUsed,
            crossReferences: gossipGirlAnalysis!.crossReferences ?? undefined,
            analyzedAt: new Date(gossipGirlAnalysis!.analyzedAt),
            sourceMatchPreference: isPreferredSourceType(signal.sourceType, GOSSIP_GIRL_CONFIG),
          },
          create: {
            id: gossipGirlAnalysis!.id,
            signalId,
            agentPersona: "GOSSIP_GIRL",
            summary: gossipGirlAnalysis!.summary,
            keyFacts: gossipGirlAnalysis!.keyFacts,
            sentiment: gossipSentimentLabel,
            sentimentData: gossipGirlAnalysis!.sentiment,
            strategicThemes: gossipGirlAnalysis!.strategicThemes,
            confidence: gossipGirlAnalysis!.confidence,
            modelUsed: gossipGirlAnalysis!.modelUsed,
            crossReferences: gossipGirlAnalysis!.crossReferences ?? undefined,
            analyzedAt: new Date(gossipGirlAnalysis!.analyzedAt),
            sourceMatchPreference: isPreferredSourceType(signal.sourceType, GOSSIP_GIRL_CONFIG),
          },
        });
        log.info("inngest.function.gossip_girl_analysis_created", {
          analysisId: gossipGirlAnalysis!.id,
          confidence: Math.round(gossipGirlAnalysis!.confidence * 1000) / 1000,
        });
      });
    } catch (error) {
      // Enhanced error logging to capture full stack trace and context
      const errorRecord: Record<string, unknown> = {};
      
      if (error instanceof Error) {
        errorRecord.name = error.name;
        errorRecord.message = error.message;
        errorRecord.stack = error.stack;
        
        // Capture Zod validation errors
        if (error.name === 'ZodError' && 'issues' in error) {
          try {
            errorRecord.zodErrors = JSON.stringify((error as ZodError).issues);
          } catch {
            errorRecord.zodErrors = 'Failed to serialize Zod errors';
          }
        }
        
        // Capture OpenAI API errors  
        if (error.constructor.name.includes('OpenAI') || error.constructor.name.includes('API')) {
          errorRecord.errorType = error.constructor.name;
          // Use type assertion to access OpenAI error properties
          const apiError = error as { status?: number; code?: string };
          if (apiError.status !== undefined) errorRecord.status = apiError.status;
          if (apiError.code !== undefined) errorRecord.code = apiError.code;
        }
      } else {
        errorRecord.error = String(error);
      }
      
      log.error("inngest.function.gossip_girl_agent_failed", errorRecord);
      
      // Also check if env vars are available
      log.error("inngest.function.env_check", {
        hasApiKey: !!process.env.API_KEY,
        hasBaseUrl: !!process.env.BASE_URL,
        hasOpenaiKey: !!process.env.OPENAI_API_KEY,
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

      throw new NonRetriableError(
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
              sentiment: "sentiment" in analystAnalysis.sentiment
                ? analystAnalysis.sentiment.sentiment
                : "NEUTRAL",
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
          // Skip if article generation was skipped
          if (articleResult.skipped) {
            log.info("inngest.function.analyst_article_skipped", {
              reason: articleResult.skipReason,
            });
            return;
          }

          // Find an inference that includes this signal in supportingSignalIds
          const inferences = await prisma.inference.findMany({
            where: { companyId: signal.companyId },
            select: { id: true, supportingSignalIds: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          });

          const matchingInference = inferences.find((inf) => {
            const ids = Array.isArray(inf.supportingSignalIds)
              ? inf.supportingSignalIds
              : [];
            return ids.includes(signalId);
          });

          // Check if article already exists for this signal+persona to prevent duplicates
          // Find all analysis IDs for this signal, then check if any article references them
          const signalAnalyses = await prisma.analysis.findMany({
            where: { signalId, agentPersona: "ANALYST" },
            select: { id: true },
          });
          const signalAnalysisIds = new Set(signalAnalyses.map((a) => a.id));

          const existingArticles = await prisma.article.findMany({
            where: { companyId: signal.companyId, agentPersona: "ANALYST" },
            select: { id: true, analysisIds: true },
          });

          const existingArticle = existingArticles.find((article) => {
            const ids = Array.isArray(article.analysisIds) ? article.analysisIds : [];
            return ids.some((id: unknown) => typeof id === "string" && signalAnalysisIds.has(id));
          });

          if (existingArticle) {
            // Update existing article instead of creating duplicate
            await prisma.article.update({
              where: { id: existingArticle.id },
              data: {
                title: articleResult.title,
                slug: articleResult.slug,
                summary: articleResult.summary,
                body: articleResult.body,
                inferenceId: matchingInference?.id ?? null,
                status: "PUBLISHED",
              },
            });
            log.info("inngest.function.analyst_article_updated", {
              articleId: existingArticle.id,
              slug: articleResult.slug,
            });
          } else {
            await prisma.article.create({
              data: {
                title: articleResult.title,
                slug: articleResult.slug,
                summary: articleResult.summary,
                body: articleResult.body,
                companyId: signal.companyId,
                agentPersona: "ANALYST",
                analysisIds: [analystAnalysis!.id],
                inferenceId: matchingInference?.id ?? null,
                status: "PUBLISHED",
              },
            });
            log.info("inngest.function.analyst_article_created", {
              slug: articleResult.slug,
              inferenceId: matchingInference?.id ?? null,
            });
          }
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
            sentiment: "surface_reading" in gossipGirlAnalysis.sentiment
              ? ({ "bullish-spin": "POSITIVE", "bearish-subtext": "NEGATIVE", "neutral-surface": "NEUTRAL", "mixed-signals": "NEUTRAL" } as Record<string, string>)[gossipGirlAnalysis.sentiment.surface_reading] ?? "NEUTRAL"
              : "NEUTRAL",
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
          // Skip if article generation was skipped
          if (articleResult.skipped) {
            log.info("inngest.function.gossip_girl_article_skipped", {
              reason: articleResult.skipReason,
            });
            return;
          }

          // Find an inference that includes this signal in supportingSignalIds
          const inferences = await prisma.inference.findMany({
            where: { companyId: signal.companyId },
            select: { id: true, supportingSignalIds: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          });

          const matchingInference = inferences.find((inf) => {
            const ids = Array.isArray(inf.supportingSignalIds)
              ? inf.supportingSignalIds
              : [];
            return ids.includes(signalId);
          });

          // Check if article already exists for this signal+persona to prevent duplicates
          const signalAnalyses = await prisma.analysis.findMany({
            where: { signalId, agentPersona: "GOSSIP_GIRL" },
            select: { id: true },
          });
          const signalAnalysisIds = new Set(signalAnalyses.map((a) => a.id));

          const existingArticles = await prisma.article.findMany({
            where: { companyId: signal.companyId, agentPersona: "GOSSIP_GIRL" },
            select: { id: true, analysisIds: true },
          });

          const existingArticle = existingArticles.find((article) => {
            const ids = Array.isArray(article.analysisIds) ? article.analysisIds : [];
            return ids.some((id: unknown) => typeof id === "string" && signalAnalysisIds.has(id));
          });

          if (existingArticle) {
            // Update existing article instead of creating duplicate
            await prisma.article.update({
              where: { id: existingArticle.id },
              data: {
                title: articleResult.title,
                slug: articleResult.slug,
                summary: articleResult.summary,
                body: articleResult.body,
                inferenceId: matchingInference?.id ?? null,
                status: "PUBLISHED",
              },
            });
            log.info("inngest.function.gossip_girl_article_updated", {
              articleId: existingArticle.id,
              slug: articleResult.slug,
            });
          } else {
            await prisma.article.create({
              data: {
                title: articleResult.title,
                slug: articleResult.slug,
                summary: articleResult.summary,
                body: articleResult.body,
                companyId: signal.companyId,
                agentPersona: "GOSSIP_GIRL",
                analysisIds: [gossipGirlAnalysis!.id],
                inferenceId: matchingInference?.id ?? null,
                status: "PUBLISHED",
              },
            });
            log.info("inngest.function.gossip_girl_article_created", {
              slug: articleResult.slug,
              inferenceId: matchingInference?.id ?? null,
            });
          }
        });
      } catch (error) {
        log.error("inngest.function.gossip_girl_article_failed", {
          error: String(error),
        });
      }
    }

    // Step 6.5: Check for high-conviction alerts
    if (analystAnalysis && gossipGirlAnalysis) {
      try {
        await step.run("check-alert-thresholds-2", async () => {
          const { checkAlertThresholds, createSignalAlert } = await import("@/lib/alerts/signal-alerts");
          
          const alertCheck = checkAlertThresholds(analystAnalysis!, gossipGirlAnalysis!);
          
          if (alertCheck.shouldAlert) {
            const gossipSentiment = gossipGirlAnalysis!.sentiment as { tell_strength?: number } | null;
            const gossipTellStrength = gossipSentiment?.tell_strength ?? 0;
            
            await createSignalAlert(
              signalId,
              signal.companyId,
              analystAnalysis!.confidence,
              gossipTellStrength,
              alertCheck.reason || "High-conviction signal detected"
            );
            
            log.info("inngest.function.alert_triggered", {
              signalId,
              analystConfidence: analystAnalysis!.confidence,
              gossipTellStrength,
            });
          }
        });
      } catch (error) {
        log.error("inngest.function.alert_check_failed", {
          error: String(error),
        });
      }
    }

    // Step 6: Generate structured debate (requires both analyses)
    // Skip per-signal debate for clustered signals — they use inference-level debate instead
    if (signal.clusterId) {
      log.info("inngest.function.debate_skipped_clustered", {
        signalId,
        clusterId: signal.clusterId,
        reason: "clustered signals use inference-level debate",
      });
    } else if (analystAnalysis && gossipGirlAnalysis) {
      try {
        const debate = await step.run("generate-debate", async () => {
          const { generateDebate } = await import("@/lib/ai/agent/debate");
          return await generateDebate(analystAnalysis!, gossipGirlAnalysis!);
        });

        await step.run("create-debate-record", async () => {
          // Delete any existing debate for this signal to prevent duplicates on re-analysis
          await prisma.agentDebate.deleteMany({
            where: { signalId, clusterId: null },
          });

          await prisma.agentDebate.create({
            data: {
              signalId,
              analystPosition: debate.analystPosition,
              gossipGirlPosition: debate.gossipGirlPosition,
              pointsOfAgreement: debate.pointsOfAgreement,
              pointsOfContention: debate.pointsOfContention,
              synthesis: debate.synthesis,
            },
          });
          log.info("inngest.function.debate_created", {
            signalId,
            agreementCount: debate.pointsOfAgreement.length,
            contentionCount: debate.pointsOfContention.length,
          });
        });
      } catch (error) {
        log.error("inngest.function.debate_failed", {
          error: String(error),
        });
      }
    }

    // Step 7: Check if signal belongs to a cluster and update cluster article if needed
    if (signal.clusterId) {
      try {
        await step.run("update-cluster-article", async () => {
          const clusterStart = Date.now();

          const cluster = await prisma.signalTheme.findUnique({
            where: { id: signal.clusterId! },
            include: {
              clusteredSignals: {
                select: {
                  id: true,
                  title: true,
                  sourceType: true,
                  analyses: {
                    select: { keyFacts: true },
                  },
                },
              },
              company: {
                select: { name: true, ticker: true },
              },
              clusterArticles: {
                select: { signalCount: true, agentPersona: true },
              },
            },
          });

          if (!cluster) {
            log.warn("inngest.function.cluster_not_found", { clusterId: signal.clusterId });
            return;
          }

          // Check if we should regenerate the article
          const currentSignalCount = cluster.clusteredSignals.length;
          const existingAnalystArticle = cluster.clusterArticles.find(
            (a) => a.agentPersona === "ANALYST"
          );
          const existingGossipArticle = cluster.clusterArticles.find(
            (a) => a.agentPersona === "GOSSIP_GIRL"
          );

          const lastAnalystCount = existingAnalystArticle?.signalCount ?? 0;
          const lastGossipCount = existingGossipArticle?.signalCount ?? 0;

          // Regenerate if signal count crossed threshold (3, 5, 10, 20) or increased by 50%
          const thresholds = [3, 5, 10, 20];
          const shouldRegenerateAnalyst =
            !existingAnalystArticle ||
            thresholds.some((t) => lastAnalystCount < t && currentSignalCount >= t) ||
            currentSignalCount >= lastAnalystCount * 1.5;

          const shouldRegenerateGossip =
            !existingGossipArticle ||
            thresholds.some((t) => lastGossipCount < t && currentSignalCount >= t) ||
            currentSignalCount >= lastGossipCount * 1.5;

          if (!shouldRegenerateAnalyst && !shouldRegenerateGossip) {
            log.info("inngest.function.cluster_article_skip", {
              clusterId: signal.clusterId,
              signalCount: currentSignalCount,
            });
            return;
          }

          // Prepare cluster data for article generation
          const clusterData = {
            label: cluster.label,
            summary: cluster.description || cluster.label,
            signals: cluster.clusteredSignals.map((s) => ({
              id: s.id,
              title: s.title,
              sourceType: s.sourceType,
              facts: s.analyses.flatMap((a) =>
                Array.isArray(a.keyFacts)
                  ? a.keyFacts.map((f) =>
                      typeof f === "string" ? f : (f && typeof f === "object" && "text" in f ? f.text : String(f))
                    )
                  : []
              ) as Array<string | { text?: string }>,
            })),
          };

          const companyInfo = {
            name: cluster.company.name,
            ticker: cluster.company.ticker || undefined,
          };

          // Generate articles for personas that need regeneration
          for (const [persona, config, shouldRegenerate] of [
            ["ANALYST", ANALYST_CONFIG, shouldRegenerateAnalyst],
            ["GOSSIP_GIRL", GOSSIP_GIRL_CONFIG, shouldRegenerateGossip],
          ] as const) {
            if (!shouldRegenerate) continue;

            try {
              const article = await generateClusterArticle(
                clusterData,
                companyInfo,
                config
              );

              await prisma.clusterArticle.upsert({
                where: {
                  themeId_agentPersona: {
                    themeId: cluster.id,
                    agentPersona: persona,
                  },
                },
                update: {
                  title: article.title,
                  slug: article.slug,
                  summary: article.summary,
                  body: article.body,
                  signalCount: currentSignalCount,
                  status: "PUBLISHED",
                  publishedAt: new Date(),
                },
                create: {
                  themeId: cluster.id,
                  companyId: cluster.companyId,
                  title: article.title,
                  slug: article.slug,
                  summary: article.summary,
                  body: article.body,
                  agentPersona: persona,
                  signalCount: currentSignalCount,
                  status: "PUBLISHED",
                  publishedAt: new Date(),
                },
              });

              log.info("inngest.function.cluster_article_created", {
                clusterId: cluster.id,
                persona,
                signalCount: currentSignalCount,
                groundingScore: article.groundingScore,
              });
            } catch (error) {
              log.error("inngest.function.cluster_article_generation_failed", {
                clusterId: cluster.id,
                persona,
                error: String(error),
              });
            }
          }
        });
      } catch (error) {
        log.error("inngest.function.cluster_article_update_failed", {
          signalId,
          clusterId: signal.clusterId,
          error: String(error),
        });
      }
    }

    // Step 8: Detect contradictions across company signals
    try {
      await step.run("detect-contradictions", async () => {
        const { detectContradictions } = await import("@/lib/ai/agent/contradiction-detector");
        const result = await detectContradictions(signal.companyId);
        
        if (result.contradictions.length > 0) {
          await prisma.signal.update({
            where: { id: signalId },
            data: { 
              contradictions: result.contradictions as unknown as Prisma.InputJsonValue,
            },
          });
          
          log.info("inngest.function.contradictions_detected", {
            signalId,
            companyId: signal.companyId,
            contradictionCount: result.contradictions.length,
            signalCount: result.signalCount,
          });
        }
      });
    } catch (error) {
      log.error("inngest.function.contradiction_detection_failed", {
        signalId,
        error: String(error),
      });
    }

    // Step 9: Link signal to existing cluster based on strategic themes
    // This ensures signals get linked to clusters even when cluster routing is disabled
    // Skip if signal is already assigned to a cluster to prevent reassignment during re-analysis
    if ((analystAnalysis || gossipGirlAnalysis) && !signal.clusterId) {
      await step.run("link-signal-to-cluster", async () => {
        try {
          // Extract strategic themes from whichever analysis succeeded
          const themes = analystAnalysis?.strategicThemes ?? gossipGirlAnalysis?.strategicThemes ?? [];
          if (themes.length === 0) {
            log.debug("inngest.function.no_themes_for_cluster_matching");
            return;
          }

          // Find existing clusters for this company
          const existingClusters = await prisma.signalTheme.findMany({
            where: {
              companyId: signal.companyId,
              status: { in: ["EMERGING", "ACCELERATING", "PEAKED"] },
            },
            select: {
              id: true,
              label: true,
              embedding: true,
            },
            take: 50,
          });

          if (existingClusters.length === 0) {
            log.debug("inngest.function.no_existing_clusters");
            return;
          }

          // Try to match signal themes to existing clusters
          // Use label similarity (case-insensitive contains) as a simple heuristic
          for (const theme of themes) {
            const themeLabel = theme.label.toLowerCase();
            const matchingCluster = existingClusters.find((cluster) => {
              const clusterLabel = cluster.label.toLowerCase();
              return clusterLabel.includes(themeLabel) || themeLabel.includes(clusterLabel);
            });

            if (matchingCluster) {
              // Link signal to this cluster
              await prisma.signal.update({
                where: { id: signalId },
                data: { clusterId: matchingCluster.id },
              });

              log.info("inngest.function.signal_linked_to_cluster", {
                signalId,
                clusterId: matchingCluster.id,
                clusterLabel: matchingCluster.label,
                matchedTheme: theme.label,
              });
              return; // Only link to first matching cluster
            }
          }

          log.debug("inngest.function.no_cluster_match_found");
        } catch (error) {
          log.warn("inngest.function.cluster_matching_failed", {
            signalId,
            error: String(error),
          });
          // Non-fatal - continue without cluster linking
        }
      });
    } else if (signal.clusterId) {
      log.debug("inngest.function.cluster_linking_skipped", {
        signalId,
        clusterId: signal.clusterId,
        reason: "signal already assigned to cluster",
      });
    }

    // Step 10: Update signal status to ANALYZED (at least one agent succeeded)
    await step.run("update-status-analyzed-standalone", async () => {
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

export const functions = [analyzeSignalFunction, discoverSignalsUnifiedFunction, correlateSignalsFunction, calibrateInferencesFunction, sourceHealthCheckFunction, generateArticleFunction, mergeClustersFunction];
