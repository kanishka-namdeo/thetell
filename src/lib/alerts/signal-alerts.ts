import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AgentAnalysis } from "@/lib/ai/agent/types";

const log = logger.child({ module: "signal-alerts" });

/**
 * Alert thresholds for high-conviction signals
 */
export const ALERT_THRESHOLDS = {
  analystConfidence: 0.8,
  gossipTellStrength: 0.7,
} as const;

/**
 * Check if a signal should trigger an alert based on dual-agent analysis
 */
export function checkAlertThresholds(
  analystAnalysis: AgentAnalysis | null,
  gossipAnalysis: AgentAnalysis | null
): { shouldAlert: boolean; reason?: string } {
  if (!analystAnalysis || !gossipAnalysis) {
    return { shouldAlert: false, reason: "Missing analysis from one or both agents" };
  }

  const analystConfidence = analystAnalysis.confidence;
  
  // Extract tell_strength from Gossip Girl's sentiment data
  const gossipSentiment = gossipAnalysis.sentiment as { tell_strength?: number } | null;
  const gossipTellStrength = gossipSentiment?.tell_strength ?? 0;

  const analystMeets = analystConfidence >= ALERT_THRESHOLDS.analystConfidence;
  const gossipMeets = gossipTellStrength >= ALERT_THRESHOLDS.gossipTellStrength;

  if (analystMeets && gossipMeets) {
    return {
      shouldAlert: true,
      reason: `High-conviction signal: Analyst confidence ${(analystConfidence * 100).toFixed(1)}%, Gossip Girl tell strength ${(gossipTellStrength * 100).toFixed(1)}%`,
    };
  }

  return { shouldAlert: false };
}

/**
 * Create an alert for a high-conviction signal
 */
export async function createSignalAlert(
  signalId: string,
  companyId: string,
  analystConfidence: number,
  gossipTellStrength: number,
  message: string
): Promise<void> {
  try {
    // Check if alert already exists for this signal to prevent duplicates on re-analysis
    const existingAlert = await prisma.signalAlert.findFirst({
      where: { signalId, alertType: "HIGH_CONVICTION" },
    });

    if (existingAlert) {
      // Update existing alert with new confidence values
      await prisma.signalAlert.update({
        where: { id: existingAlert.id },
        data: {
          analystConfidence,
          gossipTellStrength,
          message,
        },
      });

      log.info("signal_alert_updated", {
        signalId,
        companyId,
        analystConfidence,
        gossipTellStrength,
      });
    } else {
      await prisma.signalAlert.create({
        data: {
          signalId,
          companyId,
          alertType: "HIGH_CONVICTION",
          analystConfidence,
          gossipTellStrength,
          message,
          status: "PENDING",
        },
      });

      log.info("signal_alert_created", {
        signalId,
        companyId,
        analystConfidence,
        gossipTellStrength,
      });
    }
  } catch (error) {
    log.error("signal_alert_creation_failed", {
      signalId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get pending alerts for a user's watched companies
 */
export async function getPendingAlertsForUser(userId: string) {
  const watchedCompanies = await prisma.watchedCompany.findMany({
    where: { userId },
    select: { companyId: true },
  });

  const companyIds = watchedCompanies.map((w) => w.companyId);

  if (companyIds.length === 0) {
    return [];
  }

  return prisma.signalAlert.findMany({
    where: {
      companyId: { in: companyIds },
      status: "PENDING",
    },
    include: {
      signal: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          publishedAt: true,
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/**
 * Mark alerts as read
 */
export async function markAlertsAsRead(alertIds: string[], userId: string) {
  // Verify user has access to these alerts via watched companies
  const watchedCompanies = await prisma.watchedCompany.findMany({
    where: { userId },
    select: { companyId: true },
  });

  const companyIds = watchedCompanies.map((w) => w.companyId);

  await prisma.signalAlert.updateMany({
    where: {
      id: { in: alertIds },
      companyId: { in: companyIds },
    },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });
}
