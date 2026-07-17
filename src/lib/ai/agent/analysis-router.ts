/**
 * Analysis Router - Routes signals to cluster or standalone analysis paths.
 *
 * This is the main entry point for signal analysis. It determines whether a signal
 * should be analyzed as part of an existing cluster (lightweight path) or as a
 * standalone signal (full dual-agent analysis).
 *
 * The routing decision is based on embedding similarity to existing clusters.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { triageSignalToCluster } from "@/lib/nlp/cluster-triage";
import { loadSignalEmbedding } from "@/lib/nlp/embedding-store";
import { analyzeSignalForCluster, type ClusterAnalysisResult } from "./cluster-analysis";
import { updateClusterWithSignal } from "./cluster-update";
import { analyzeSignalWithAgent, type AgentAnalysisInput, type PipelineMetrics } from "./pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "./personas";
import type { AgentAnalysis, AnalystSentiment, GossipSentiment } from "./types";
import { extractSentimentLabel } from "./types";
import type { ProviderName } from "../provider";
import type { Signal, Company } from "@prisma/client";

export interface AnalysisRouterOptions {
  forceStandalone?: boolean;
  providerName?: ProviderName;
  model?: string;
}

export interface AnalysisRouterResult {
  path: "cluster" | "standalone";
  clusterId?: string;
  clusterLabel?: string;
  similarity?: number;
  analysis: AgentAnalysis | ClusterAnalysisResult;
  debate?: unknown; // AgentDebate type from existing code
}

/**
 * Persist AnalysisMetrics record to database after analysis completes.
 */
async function persistAnalysisMetrics(
  analysisId: string,
  signalId: string,
  metrics: PipelineMetrics,
  routingInfo: {
    path: "cluster" | "standalone";
    clusterId?: string;
    similarity?: number;
  }
): Promise<void> {
  try {
    await prisma.analysisMetrics.create({
      data: {
        analysisId,
        signalId,
        tokensIn: metrics.tokensIn,
        tokensOut: metrics.tokensOut,
        llmCallCount: metrics.llmCallCount,
        totalLatencyMs: metrics.totalLatencyMs,
        nlpLatencyMs: metrics.nlpLatencyMs,
        llmLatencyMs: metrics.llmLatencyMs,
        groundingScore: metrics.groundingScore,
        validFactCount: metrics.validFactCount,
        invalidFactCount: metrics.invalidFactCount,
        sourceCredibility: metrics.confidenceBreakdown.sourceCredibility,
        contentQuality: metrics.confidenceBreakdown.contentQuality,
        factConfidence: metrics.confidenceBreakdown.factConfidence,
        themeEvidence: metrics.confidenceBreakdown.themeEvidence,
        analysisPath: routingInfo.path,
        clusterId: routingInfo.clusterId,
        clusterSimilarity: routingInfo.similarity,
      },
    });
  } catch (error) {
    // Log but don't fail the analysis if metrics persistence fails
    logger.error("analysis_router.metrics_persistence_failed", {
      analysisId,
      signalId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Route a signal to either cluster or standalone analysis path.
 *
 * This function:
 * 1. Loads the signal and its embedding
 * 2. Checks if cluster routing is enabled (via SystemConfig)
 * 3. Attempts to match the signal to an existing cluster
 * 4. Routes to lightweight cluster analysis or full dual-agent analysis
 * 5. Returns unified result with path taken
 */
export async function analyzeSignalWithTriage(
  signalId: string,
  options: AnalysisRouterOptions = {}
): Promise<AnalysisRouterResult> {
  const log = logger.child({ signalId, function: "analyzeSignalWithTriage" });
  const startTime = Date.now();

  log.info("analysis_router.start");

  // Load signal with company and embedding
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: {
      company: true,
    },
  });

  if (!signal) {
    throw new Error(`Signal not found: ${signalId}`);
  }

  // Check if cluster routing is enabled
  const config = await prisma.systemConfig.findFirst();
  const clusterRoutingEnabled = config?.clusterRoutingEnabled ?? false;

  if (!clusterRoutingEnabled || options.forceStandalone) {
    log.info("analysis_router.standalone_path", {
      reason: !clusterRoutingEnabled ? "routing_disabled" : "force_standalone",
    });
    return await runStandaloneAnalysis(toAgentInput(signal), options);
  }

  // Load signal embedding
  const embedding = await loadSignalEmbedding(signalId);
  if (!embedding) {
    log.warn("analysis_router.no_embedding", { signalId });
    return await runStandaloneAnalysis(toAgentInput(signal), options);
  }

  // Attempt cluster triage
  const triageResult = await triageSignalToCluster(signal.companyId, embedding, {
    threshold: config?.clusterMatchThreshold ?? 0.75,
  });

  if (!triageResult.matched || !triageResult.cluster) {
    log.info("analysis_router.no_cluster_match", {
      signalId,
      bestSimilarity: triageResult.cluster?.similarity ?? 0,
    });
    return await runStandaloneAnalysis(toAgentInput(signal), options);
  }

  // Route to cluster analysis path
  log.info("analysis_router.cluster_match", {
    signalId,
    clusterId: triageResult.cluster.themeId,
    clusterLabel: triageResult.cluster.label,
    similarity: triageResult.cluster.similarity,
  });

  return await runClusterAnalysis(
    toAgentInput(signal),
    triageResult.cluster.themeId,
    triageResult.cluster.label,
    triageResult.cluster.similarity,
    options
  );
}

/**
 * Convert a Prisma Signal (with company) to AgentAnalysisInput shape.
 * Handles the Json? fields (engagement, metadata) which are unknown at the type level.
 */
function toAgentInput(
  signal: Signal & { company: Company }
): AgentAnalysisInput & { company: { id: string; name: string; slug: string; ticker: string | null } } {
  return {
    id: signal.id,
    sourceUrl: signal.sourceUrl,
    sourceType: signal.sourceType,
    title: signal.title,
    rawContent: signal.rawContent,
    publishedAt: signal.publishedAt,
    scrapedAt: signal.scrapedAt,
    companyId: signal.companyId,
    status: signal.status,
    engagement: signal.engagement as AgentAnalysisInput["engagement"],
    metadata: signal.metadata as AgentAnalysisInput["metadata"],
    company: {
      id: signal.company.id,
      name: signal.company.name,
      slug: signal.company.slug,
      ticker: signal.company.ticker,
    },
  };
}

/**
 * Run full dual-agent analysis for standalone signals.
 */
async function runStandaloneAnalysis(
  signal: AgentAnalysisInput & { company: { id: string; name: string; slug: string; ticker: string | null } },
  options: AnalysisRouterOptions
): Promise<AnalysisRouterResult> {
  const log = logger.child({ signalId: signal.id, path: "standalone" });

  // Run both agent analyses in parallel with allSettled for resilience —
  // if one agent fails (rate limit, timeout), the other's result is still saved.
  const [analystSettled, gossipSettled] = await Promise.allSettled([
    analyzeSignalWithAgent(signal, ANALYST_CONFIG, undefined, options.providerName, options.model),
    analyzeSignalWithAgent(signal, GOSSIP_GIRL_CONFIG, undefined, options.providerName, options.model),
  ]);

  if (analystSettled.status === "rejected") {
    log.error("analysis_router.analyst_failed", { error: String(analystSettled.reason) });
  }
  if (gossipSettled.status === "rejected") {
    log.error("analysis_router.gossip_girl_failed", { error: String(gossipSettled.reason) });
  }

  // If both agents failed, throw to signal complete failure
  if (analystSettled.status === "rejected" && gossipSettled.status === "rejected") {
    throw new Error("Both agent analyses failed");
  }

  const analystResult = analystSettled.status === "fulfilled" ? analystSettled.value : null;
  const gossipResult = gossipSettled.status === "fulfilled" ? gossipSettled.value : null;
  const analystAnalysis = analystResult?.analysis;
  const gossipAnalysis = gossipResult?.analysis;

  // TODO: Generate debate between agents (existing logic from functions.ts)

  // Persist Analysis records and metrics (only for successful analyses)
  const persistPromises: Promise<unknown>[] = [];

  if (analystAnalysis) {
    const analystSentimentLabel = extractSentimentLabel(analystAnalysis);
    persistPromises.push(
      prisma.analysis.upsert({
        where: { signalId_agentPersona: { signalId: signal.id, agentPersona: "ANALYST" } },
        update: {
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts,
          sentiment: analystSentimentLabel,
          sentimentData: analystAnalysis.sentiment,
          strategicThemes: analystAnalysis.strategicThemes,
          confidence: analystAnalysis.confidence,
          modelUsed: analystAnalysis.modelUsed,
          analyzedAt: analystAnalysis.analyzedAt,
          sourceMatchPreference: analystAnalysis.sourceMatchPreference,
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
          analyzedAt: analystAnalysis.analyzedAt,
          sourceMatchPreference: analystAnalysis.sourceMatchPreference,
        },
      }).then(record =>
        persistAnalysisMetrics(record.id, signal.id, analystResult!.metrics, { path: "standalone" })
      )
    );
  }

  if (gossipAnalysis) {
    const gossipSentimentLabel = extractSentimentLabel(gossipAnalysis);
    persistPromises.push(
      prisma.analysis.upsert({
        where: { signalId_agentPersona: { signalId: signal.id, agentPersona: "GOSSIP_GIRL" } },
        update: {
          summary: gossipAnalysis.summary,
          keyFacts: gossipAnalysis.keyFacts,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipAnalysis.sentiment,
          strategicThemes: gossipAnalysis.strategicThemes,
          confidence: gossipAnalysis.confidence,
          modelUsed: gossipAnalysis.modelUsed,
          analyzedAt: gossipAnalysis.analyzedAt,
          sourceMatchPreference: gossipAnalysis.sourceMatchPreference,
        },
        create: {
          id: gossipAnalysis.id,
          signalId: signal.id,
          agentPersona: "GOSSIP_GIRL",
          summary: gossipAnalysis.summary,
          keyFacts: gossipAnalysis.keyFacts,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipAnalysis.sentiment,
          strategicThemes: gossipAnalysis.strategicThemes,
          confidence: gossipAnalysis.confidence,
          modelUsed: gossipAnalysis.modelUsed,
          analyzedAt: gossipAnalysis.analyzedAt,
          sourceMatchPreference: gossipAnalysis.sourceMatchPreference,
        },
      }).then(record =>
        persistAnalysisMetrics(record.id, signal.id, gossipResult!.metrics, { path: "standalone" })
      )
    );
  }

  await Promise.all(persistPromises);

  log.info("analysis_router.standalone_complete", {
    signalId: signal.id,
    analystConfidence: analystAnalysis?.confidence ?? null,
    gossipConfidence: gossipAnalysis?.confidence ?? null,
  });

  // Return primary analysis (prefer analyst, fallback to gossip)
  return {
    path: "standalone",
    analysis: analystAnalysis ?? gossipAnalysis!,
  };
}

/**
 * Run lightweight cluster analysis for matched signals.
 */
async function runClusterAnalysis(
  signal: AgentAnalysisInput & { company: { id: string; name: string; slug: string; ticker: string | null } },
  clusterId: string,
  clusterLabel: string,
  similarity: number,
  options: AnalysisRouterOptions
): Promise<AnalysisRouterResult> {
  const log = logger.child({ signalId: signal.id, clusterId, path: "cluster" });

  // Load cluster data
  const cluster = await prisma.signalTheme.findUnique({
    where: { id: clusterId },
    include: {
      clusteredSignals: {
        select: {
          id: true,
          title: true,
          sourceType: true,
        },
      },
    },
  });

  if (!cluster) {
    throw new Error(`Cluster not found: ${clusterId}`);
  }

  // Run lightweight cluster analysis for both agents in parallel
  const clusterSummaryObj = cluster.clusterSummary as Record<string, unknown> | null;
  const [analystClusterResult, gossipClusterResult] = await Promise.all([
    analyzeSignalForCluster(
      signal,
      {
        label: cluster.label,
        summary: cluster.clusterSummary,
        signalCount: cluster.clusteredSignals.length,
        existingThemes: (clusterSummaryObj?.keyThemes as string[]) ?? [],
      },
      "ANALYST",
      options.providerName,
      options.model
    ),
    analyzeSignalForCluster(
      signal,
      {
        label: cluster.label,
        summary: cluster.clusterSummary,
        signalCount: cluster.clusteredSignals.length,
        existingThemes: (clusterSummaryObj?.keyThemes as string[]) ?? [],
      },
      "GOSSIP_GIRL",
      options.providerName,
      options.model
    ),
  ]);

  // Update cluster with new signal
  const updateResult = await updateClusterWithSignal(
    clusterId,
    signal.id,
    analystClusterResult.analysis,
    { id: signal.company.id, name: signal.company.name }
  );

  // Link signal to cluster
  await prisma.signal.update({
    where: { id: signal.id },
    data: { clusterId },
  });

  log.info("analysis_router.cluster_complete", {
    signalId: signal.id,
    clusterId,
    similarity,
  });

  return {
    path: "cluster",
    clusterId,
    clusterLabel,
    similarity,
    analysis: analystClusterResult.analysis,
  };
}

// regenerateClusterArticles removed (ClusterArticle feature deprecated)
