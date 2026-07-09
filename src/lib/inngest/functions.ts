/**
 * Inngest functions for background processing.
 * Runs dual-agent analysis (Analyst + Gossip Girl) sequentially per signal.
 */

import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { analyzeSignalWithAgent } from "@/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG, isPreferredSourceType } from "@/lib/ai/agent/personas";
import { logger } from "@/lib/logger";
import type { CrossRefAnalysis } from "@/lib/ai/agent/pipeline";
import type { AgentAnalysis } from "@/lib/ai/agent/types";
import { extractSentimentLabel } from "@/lib/ai/agent/types";
import type { ZodError } from "zod";
import { discoverSignalsUnifiedFunction } from "./signal-discovery";
import { correlateSignalsFunction } from "./correlation";
import { sourceHealthCheckFunction } from "./source-health";
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
    concurrency: [
      { limit: 1, key: "event.data.signalId" },
      { limit: 3 },
    ],
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

    // Step 0: Concurrency guard — claim the signal to prevent concurrent analysis
    // Accept signals that are not ANALYZING, OR are stale ANALYZING (>10min old)
    // Moved into step.run() so it's checkpointed and doesn't run on resumed executions
    const claimResult = await step.run("claim-signal", async () => {
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      const claimed = await prisma.signal.updateMany({
        where: {
          id: signalId,
          OR: [
            { status: { not: "ANALYZING" } },
            { status: "ANALYZING", updatedAt: { lt: staleThreshold } },
          ],
        },
        data: { status: "ANALYZING" },
      });
      return { claimed: claimed.count > 0 };
    });

    if (!claimResult.claimed) {
      log.warn("inngest.function.already_analyzing", { signalId });
      return { success: false, reason: "already_analyzing" };
    }

    // Step 1: Load signal with company
    const signal = await step.run("load-signal", async () => {
      const s = await prisma.signal.findUnique({
        where: { id: signalId },
        include: { company: true },
      });

      if (!s) {
        log.error("inngest.function.signal_not_found", { signalId });
        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "FAILED" },
        });
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
        // Store quality gate scores in metadata for daily rollup analysis
        const existingSignal = await prisma.signal.findUnique({
          where: { id: signalId },
          select: { metadata: true },
        });
        
        const existingMetadata = (existingSignal?.metadata as Record<string, unknown>) || {};
        const qualityMetadata = {
          ...existingMetadata,
          qualityGate: {
            score: qualityCheck.score,
            pass: qualityCheck.pass,
            reasons: qualityCheck.reasons,
          },
        };

        await prisma.signal.update({
          where: { id: signalId },
          data: { 
            status: "LOW_QUALITY",
            metadata: qualityMetadata,
          },
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
          const analystClusterResult = await analyzeSignalForCluster(
            signalInput,
            {
              label: triageResult.cluster!.label,
              summary: null, // Will be loaded in updateClusterWithSignal
              signalCount: 0, // Will be loaded in updateClusterWithSignal
              existingThemes: [],
            },
            "ANALYST"
          );

          const gossipClusterResult = await analyzeSignalForCluster(
            signalInput,
            {
              label: triageResult.cluster!.label,
              summary: null,
              signalCount: 0,
              existingThemes: [],
            },
            "GOSSIP_GIRL"
          );

          return { analyst: analystClusterResult.analysis, gossip: gossipClusterResult.analysis };
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

        // Cross-signal cluster debate generation removed - per-signal debates remain
        // AgentDebate records are created during per-signal analysis

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
          clusterId: triageResult.cluster?.themeId,
          error: String(error),
        });
        // Mark signal as FAILED instead of falling through to standalone path
        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "FAILED" },
        });
        return { success: false, reason: "cluster_path_failed", error: String(error) };
      }
    }

    // STANDALONE PATH: Full dual-agent analysis for signals not matching any cluster
    log.info("inngest.function.standalone_path_start");

    let analystAnalysis: AgentAnalysis | null = null;
    let gossipGirlAnalysis: AgentAnalysis | null = null;

    // Step 3: Run Analyst agent pipeline
    try {
      const analystResult = await step.run("run-analyst-agent", async () => {
        return await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
      });
      analystAnalysis = analystResult.analysis;

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

      const gossipResult = await step.run("run-gossip-girl-agent", async () => {
        return await analyzeSignalWithAgent(
          signalInput,
          GOSSIP_GIRL_CONFIG,
          crossRefAnalyses
        );
      });
      gossipGirlAnalysis = gossipResult.analysis;

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

export const functions = [analyzeSignalFunction, discoverSignalsUnifiedFunction, correlateSignalsFunction, sourceHealthCheckFunction, mergeClustersFunction];
