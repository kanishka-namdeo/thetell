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
import { analyzeSignalWithAgent, type AgentAnalysisInput } from "./pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "./personas";
import { generateArticleWithAgent, type AgentArticleResult } from "./article-generator";
import { generateClusterArticle } from "./cluster-article-generator";
import type { AgentPersona, AgentAnalysis, AnalystSentiment, GossipSentiment } from "./types";
import type { ProviderName } from "../provider";
import type { ClusterArticle, Signal, Company } from "@prisma/client";

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
  articles?: AgentArticleResult[];
  debate?: unknown; // AgentDebate type from existing code
  clusterArticles?: ClusterArticle[];
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

  // Run analyst analysis
  const analystAnalysis = await analyzeSignalWithAgent(
    signal,
    ANALYST_CONFIG,
    undefined,
    options.providerName,
    options.model
  );

  // Run gossip girl analysis
  const gossipAnalysis = await analyzeSignalWithAgent(
    signal,
    GOSSIP_GIRL_CONFIG,
    undefined,
    options.providerName,
    options.model
  );

  // Build article input from analyst analysis
  const analystSentiment = analystAnalysis.sentiment;
  const analystSentimentValue = analystAnalysis.agentPersona === "ANALYST"
    ? (analystSentiment as AnalystSentiment).sentiment
    : (analystSentiment as GossipSentiment).surface_reading;

  const analystArticleInput = {
    companyId: signal.companyId,
    companyName: signal.company.name,
    analyses: [{
      summary: analystAnalysis.summary,
      keyFacts: analystAnalysis.keyFacts.map(f => ({ text: f.text, source_sentence: f.source_sentence })),
      sentiment: analystSentimentValue,
      strategicThemes: analystAnalysis.strategicThemes.map(t => ({ label: t.label })),
    }],
    agentPersona: "ANALYST" as const,
    sourceType: signal.sourceType,
    sourceText: signal.rawContent,
    engagement: signal.engagement,
    metadata: signal.metadata,
  };

  // Build article input from gossip analysis
  const gossipSentiment = gossipAnalysis.sentiment;
  const gossipSentimentValue = gossipAnalysis.agentPersona === "ANALYST"
    ? (gossipSentiment as AnalystSentiment).sentiment
    : (gossipSentiment as GossipSentiment).surface_reading;

  const gossipArticleInput = {
    companyId: signal.companyId,
    companyName: signal.company.name,
    analyses: [{
      summary: gossipAnalysis.summary,
      keyFacts: gossipAnalysis.keyFacts.map(f => ({ text: f.text, source_sentence: f.source_sentence })),
      sentiment: gossipSentimentValue,
      strategicThemes: gossipAnalysis.strategicThemes.map(t => ({ label: t.label })),
    }],
    agentPersona: "GOSSIP_GIRL" as const,
    sourceType: signal.sourceType,
    sourceText: signal.rawContent,
    engagement: signal.engagement,
    metadata: signal.metadata,
  };

  // Generate articles for both agents
  const analystArticle = await generateArticleWithAgent(
    analystArticleInput,
    ANALYST_CONFIG,
    undefined,
    options.providerName,
    options.model
  );

  const gossipArticle = await generateArticleWithAgent(
    gossipArticleInput,
    GOSSIP_GIRL_CONFIG,
    undefined,
    options.providerName,
    options.model
  );

  // TODO: Generate debate between agents (existing logic from functions.ts)

  log.info("analysis_router.standalone_complete", {
    signalId: signal.id,
    analystConfidence: analystAnalysis.confidence,
    gossipConfidence: gossipAnalysis.confidence,
  });

  return {
    path: "standalone",
    analysis: analystAnalysis, // Return analyst analysis as primary
    articles: [analystArticle, gossipArticle],
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

  // Run lightweight cluster analysis for both agents
  const clusterSummaryObj = cluster.clusterSummary as Record<string, unknown> | null;
  const analystClusterAnalysis = await analyzeSignalForCluster(
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
  );

  const gossipClusterAnalysis = await analyzeSignalForCluster(
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
  );

  // Update cluster with new signal
  const updateResult = await updateClusterWithSignal(
    clusterId,
    signal.id,
    analystClusterAnalysis,
    { id: signal.company.id, name: signal.company.name }
  );

  // Link signal to cluster
  await prisma.signal.update({
    where: { id: signal.id },
    data: { clusterId },
  });

  // Generate cluster articles if threshold crossed
  let clusterArticles: ClusterArticle[] | undefined;
  if (updateResult.regenerateArticle) {
    clusterArticles = await regenerateClusterArticles(clusterId, {
      providerName: options.providerName,
      model: options.model,
    });
  }

  log.info("analysis_router.cluster_complete", {
    signalId: signal.id,
    clusterId,
    similarity,
    articleRegenerated: updateResult.regenerateArticle,
  });

  return {
    path: "cluster",
    clusterId,
    clusterLabel,
    similarity,
    analysis: analystClusterAnalysis,
    clusterArticles,
  };
}

/**
 * Regenerate cluster articles after significant cluster updates.
 *
 * Loads the cluster with all its signals and their latest analysis facts,
 * then generates articles for both agent personas.
 */
export async function regenerateClusterArticles(
  clusterId: string,
  options?: { providerName?: ProviderName; model?: string }
): Promise<ClusterArticle[]> {
  const log = logger.child({ clusterId, function: "regenerateClusterArticles" });

  const cluster = await prisma.signalTheme.findUnique({
    where: { id: clusterId },
    include: {
      company: { select: { id: true, name: true, ticker: true } },
      clusteredSignals: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          analyses: {
            select: { keyFacts: true },
            orderBy: { analyzedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { scrapedAt: "desc" },
      },
    },
  });

  if (!cluster) {
    log.warn("regenerate_cluster_articles.cluster_not_found");
    return [];
  }

  if (!cluster.clusterSummary) {
    log.warn("regenerate_cluster_articles.no_summary");
    return [];
  }

  const signals = cluster.clusteredSignals.map((s) => {
    const keyFacts = s.analyses[0]?.keyFacts as Array<{ text?: string } | string> | null;
    return {
      id: s.id,
      title: s.title,
      sourceType: s.sourceType,
      facts: (keyFacts ?? []).map((f) =>
        typeof f === "string" ? f : f.text ?? ""
      ).filter(Boolean),
    };
  });

  const clusterData = {
    label: cluster.label,
    summary: cluster.clusterSummary as string | Record<string, unknown>,
    signals,
  };

  const companyInfo = {
    id: cluster.company.id,
    name: cluster.company.name,
    ticker: cluster.company.ticker ?? undefined,
  };

  const analystArticle = await generateClusterArticle(
    clusterData,
    companyInfo,
    ANALYST_CONFIG,
    options?.providerName,
    options?.model
  );

  const gossipArticle = await generateClusterArticle(
    clusterData,
    companyInfo,
    GOSSIP_GIRL_CONFIG,
    options?.providerName,
    options?.model
  );

  const signalCount = cluster.clusteredSignals.length;

  const [analystClusterArticle, gossipClusterArticle] = await Promise.all([
    prisma.clusterArticle.upsert({
      where: {
        themeId_agentPersona: {
          themeId: clusterId,
          agentPersona: "ANALYST",
        },
      },
      update: {
        title: analystArticle.title,
        summary: analystArticle.summary,
        body: analystArticle.body,
        signalCount,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      create: {
        themeId: clusterId,
        companyId: cluster.company.id,
        title: analystArticle.title,
        slug: `cluster-${clusterId}-analyst-${Date.now()}`,
        summary: analystArticle.summary,
        body: analystArticle.body,
        agentPersona: "ANALYST",
        signalCount,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    }),
    prisma.clusterArticle.upsert({
      where: {
        themeId_agentPersona: {
          themeId: clusterId,
          agentPersona: "GOSSIP_GIRL",
        },
      },
      update: {
        title: gossipArticle.title,
        summary: gossipArticle.summary,
        body: gossipArticle.body,
        signalCount,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      create: {
        themeId: clusterId,
        companyId: cluster.company.id,
        title: gossipArticle.title,
        slug: `cluster-${clusterId}-gossip-${Date.now()}`,
        summary: gossipArticle.summary,
        body: gossipArticle.body,
        agentPersona: "GOSSIP_GIRL",
        signalCount,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    }),
  ]);

  log.info("regenerate_cluster_articles.complete", {
    clusterId,
    signalCount,
  });

  return [analystClusterArticle, gossipClusterArticle];
}
