/**
 * In-memory approval waiter for DeepAgent HITL flow.
 *
 * When the agent requests approval for a dangerous operation, the stream
 * pauses and waits for the user's decision. This module provides the
 * promise-based mechanism to coordinate between the stream and the API.
 */

import { logger } from "@/lib/logger";

const approvalResolvers = new Map<string, (decision: "approved" | "rejected") => void>();
const approvalTimeouts = new Map<string, NodeJS.Timeout>();

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Periodic cleanup to prevent memory leaks from orphaned approvals.
 * Runs every minute to remove stale entries.
 * 
 * We need bidirectional cleanup because:
 * 1. Orphaned timeouts: timeout exists but resolver was deleted (stream closed)
 * 2. Orphaned resolvers: resolver exists but timeout was cleared (e.g., manual cancel)
 */
const globalKey = "__approvalCleanupInterval";
if (!(globalKey in globalThis)) {
  const intervalId = setInterval(() => {
    const staleTimeouts: string[] = [];
    const staleResolvers: string[] = [];

    // Find orphaned timeouts (no corresponding resolver)
    for (const id of approvalTimeouts.keys()) {
      if (!approvalResolvers.has(id)) {
        staleTimeouts.push(id);
      }
    }

    // Find orphaned resolvers (no corresponding timeout)
    // This is the reverse case - resolver exists but timeout was cleared
    for (const id of approvalResolvers.keys()) {
      if (!approvalTimeouts.has(id)) {
        staleResolvers.push(id);
      }
    }

    // Clean up orphaned timeouts
    for (const id of staleTimeouts) {
      const timeout = approvalTimeouts.get(id);
      if (timeout) {
        clearTimeout(timeout);
      }
      approvalTimeouts.delete(id);
      logger.debug("approval_waiter.cleanup.orphaned_timeout", { approvalId: id });
    }

    // Clean up orphaned resolvers
    for (const id of staleResolvers) {
      approvalResolvers.delete(id);
      logger.debug("approval_waiter.cleanup.orphaned_resolver", { approvalId: id });
    }

    if (staleTimeouts.length > 0 || staleResolvers.length > 0) {
      logger.info("approval_waiter.cleanup.completed", {
        orphanedTimeouts: staleTimeouts.length,
        orphanedResolvers: staleResolvers.length,
      });
    }
  }, 60 * 1000);
  intervalId.unref(); // unref() prevents timer from keeping process alive
  (globalThis as Record<string, unknown>)[globalKey] = intervalId;
}

/**
 * Wait for an approval decision.
 *
 * Returns a promise that resolves when the user approves or rejects,
 * or when the timeout expires (returns "timeout").
 */
export function waitForApproval(
  approvalId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<"approved" | "rejected" | "timeout"> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn("deepagent.approval.timeout", { approvalId });
      approvalResolvers.delete(approvalId);
      approvalTimeouts.delete(approvalId);
      resolve("timeout");
    }, timeoutMs);

    approvalTimeouts.set(approvalId, timeout);

    approvalResolvers.set(approvalId, (decision) => {
      clearTimeout(timeout);
      approvalResolvers.delete(approvalId);
      approvalTimeouts.delete(approvalId);
      resolve(decision);
    });
  });
}

/**
 * Resolve an approval with the user's decision.
 */
export function resolveApproval(
  approvalId: string,
  decision: "approved" | "rejected"
): boolean {
  const resolver = approvalResolvers.get(approvalId);
  if (!resolver) {
    logger.warn("deepagent.approval.not_found", { approvalId });
    return false;
  }

  resolver(decision);
  return true;
}

/**
 * Check if an approval is pending.
 */
export function isApprovalPending(approvalId: string): boolean {
  return approvalResolvers.has(approvalId);
}

/**
 * Cancel a pending approval (e.g., on stream abort).
 */
export function cancelApproval(approvalId: string): void {
  const timeout = approvalTimeouts.get(approvalId);
  if (timeout) {
    clearTimeout(timeout);
    approvalTimeouts.delete(approvalId);
  }
  approvalResolvers.delete(approvalId);
}
