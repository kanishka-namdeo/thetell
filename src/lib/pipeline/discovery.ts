/**
 * Shared discovery logic for pipeline orchestration.
 * 
 * This module contains the core discovery logic that can be reused by:
 * - SSE stream route (interactive discovery)
 * - Batch discovery (multiple companies)
 * - Background jobs
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { SourceType } from "@prisma/client";
import {
  callSecEdgar,
  callGitHub,
  callUspto,
  callCourtListener,
  callJobData,
  callFreeSearchForSources,
  type McpSource,
} from "@/lib/pipeline/mcp-clients";
import { verifySourceUrl } from "@/lib/sources/verifier";
import { identifyGaps } from "@/lib/pipeline/gap-analyzer";

export interface DiscoveryResult {
  sessionId: string;
  companyName: string;
  companyId?: string;
  discoveredSources: McpSource[];
  verifiedSources: Array<{
    url: string;
    sourceType: string;
    label?: string;
    priority?: number;
    verified: boolean;
    verificationDetails?: string;
  }>;
  gaps: string[];
  eventLog: DiscoveryEvent[];
}

export interface DiscoveryEvent {
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Run discovery for a single company.
 * 
 * This function:
 * 1. Calls 6 MCP servers in parallel (SEC EDGAR, GitHub, USPTO, CourtListener, JobData, FreeSearch)
 * 2. Verifies each discovered source URL
 * 3. Identifies gaps in source coverage
 * 4. Returns structured results
 * 
 * @param companyName - Name of the company to discover sources for
 * @param companyId - Optional company ID (if known)
 * @param sessionId - Session ID for tracking
 * @returns Discovery results with sources, gaps, and event log
 */
export async function runDiscovery(
  companyName: string,
  companyId: string | undefined,
  sessionId: string
): Promise<DiscoveryResult> {
  const log = logger.child({ sessionId, companyName, function: "runDiscovery" });
  const eventLog: DiscoveryEvent[] = [];

  const addEvent = (type: string, data: Record<string, unknown>) => {
    eventLog.push({ type, timestamp: new Date(), data });
  };

  addEvent("discovery.started", { companyName, companyId });

  // MCP servers to call
  const mcpServers = [
    { name: "sec-edgar", fn: () => callSecEdgar(companyName) },
    { name: "github", fn: () => callGitHub(companyName) },
    { name: "uspto", fn: () => callUspto(companyName) },
    { name: "courtlistener", fn: () => callCourtListener(companyName) },
    { name: "jobdata", fn: () => callJobData(companyName) },
    { name: "free-search", fn: () => callFreeSearchForSources(companyName) },
  ];

  addEvent("discovery.mcp_start", { serverCount: mcpServers.length });

  // Call all MCP servers in parallel
  const results = await Promise.allSettled(
    mcpServers.map(async (server) => {
      addEvent("tool.call_start", { tool: server.name, company: companyName });
      
      try {
        const result = await server.fn();
        
        addEvent("tool.call_end", {
          tool: server.name,
          sourceCount: result.sources.length,
          duration: result.duration,
        });

        return { server: server.name, result };
      } catch (error) {
        addEvent("tool.error", {
          tool: server.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    })
  );

  // Collect all discovered sources
  const discoveredSources: McpSource[] = [];
  const sourceTypes: SourceType[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const source of result.value.result.sources) {
        discoveredSources.push(source);
        sourceTypes.push(source.sourceType as SourceType);
      }
    }
  }

  addEvent("discovery.sources_collected", { count: discoveredSources.length });

  // Verify each source
  const verifiedSources: DiscoveryResult["verifiedSources"] = [];
  
  for (const source of discoveredSources) {
    addEvent("source.verifying", { url: source.url });

    const verification = await verifySourceUrl(source.url);
    
    verifiedSources.push({
      url: source.url,
      sourceType: source.sourceType,
      label: source.label,
      priority: source.priority,
      verified: verification.reachable,
      verificationDetails: verification.error || `HTTP ${verification.statusCode}`,
    });

    addEvent("source.verified", {
      url: source.url,
      reachable: verification.reachable,
      statusCode: verification.statusCode,
    });
  }

  // Identify gaps
  const gaps = identifyGaps(sourceTypes);
  
  addEvent("discovery.gaps_identified", {
    missing: gaps.missing,
    recommendations: gaps.recommendations,
  });

  addEvent("discovery.completed", {
    totalSources: discoveredSources.length,
    verifiedCount: verifiedSources.filter((s) => s.verified).length,
    gapsCount: gaps.missing.length,
  });

  log.info("discovery.completed", {
    sessionId,
    companyName,
    totalSources: discoveredSources.length,
    verifiedCount: verifiedSources.filter((s) => s.verified).length,
    gapsCount: gaps.missing.length,
  });

  return {
    sessionId,
    companyName,
    companyId,
    discoveredSources,
    verifiedSources,
    gaps: gaps.missing,
    eventLog,
  };
}

/**
 * Save discovered sources to the database.
 * 
 * @param sessionId - Session ID to associate sources with
 * @param sources - Array of verified sources to save
 */
export async function saveDiscoveredSources(
  sessionId: string,
  sources: DiscoveryResult["verifiedSources"]
): Promise<void> {
  if (sources.length === 0) {
    return;
  }

  await prisma.discoveredSource.createMany({
    data: sources.map((source) => ({
      sessionId,
      url: source.url,
      sourceType: source.sourceType as SourceType,
      label: source.label,
      priority: source.priority ?? 5,
      verified: source.verified,
      verificationDetails: source.verificationDetails,
    })),
  });
}
