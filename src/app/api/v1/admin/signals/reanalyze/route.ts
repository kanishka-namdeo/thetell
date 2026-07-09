import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";
import { analyzeSignalWithTriage } from "@/lib/ai/agent/analysis-router";

const ReanalyzeSchema = z.object({
  signalId: z.string().optional(),
  signalIds: z.array(z.string()).optional(),
  companyId: z.string().optional(),
  mode: z.enum(["inline", "async"]).optional().default("async"),
  force: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: "POST /api/v1/admin/signals/reanalyze",
  });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body — bulk re-trigger all PENDING signals
    }

    const parsed = ReanalyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { signalId, signalIds, companyId, mode, force } = parsed.data;

    // Single signal inline mode: run full analysis in-route
    if (signalId && mode === "inline") {
      log.info("admin.signals.reanalyze.inline.start", { signalId });

      const signal = await prisma.signal.findUnique({
        where: { id: signalId },
        include: { company: true, analyses: true },
      });

      if (!signal) {
        return NextResponse.json(
          { error: "not_found", message: "Signal not found" },
          { status: 404 }
        );
      }

      await prisma.signal.update({
        where: { id: signalId },
        data: { status: "ANALYZING" },
      });

      try {
        // Use analysis router for cluster-aware triage
        const routerResult = await analyzeSignalWithTriage(signalId);

        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "ANALYZED" },
        });

        await logAuditEvent({
          userId: session.user.id,
          action: "content.signal.reanalyze",
          resource: "signal",
          resourceId: signalId,
          details: { success: true, mode: "inline", path: routerResult.path, clusterId: routerResult.clusterId },
          request: req,
        });

        log.info("admin.signals.reanalyze.inline.success", { signalId, path: routerResult.path, clusterId: routerResult.clusterId });
        return NextResponse.json({ 
          success: true, 
          message: "Signal re-analyzed successfully", 
          mode: "inline",
          path: routerResult.path,
          clusterId: routerResult.clusterId,
        });
      } catch (err) {
        log.error("admin.signals.reanalyze.inline.failed", { signalId, error: String(err) });
        await prisma.signal.update({
          where: { id: signalId },
          data: { status: "FAILED" },
        });
        return NextResponse.json(
          { error: "analysis_failed", message: "Failed to re-analyze signal" },
          { status: 500 }
        );
      }
    }

    // Single signal async mode: trigger via Inngest
    if (signalId && mode === "async") {
      log.info("admin.signals.reanalyze.async.start", { signalId });

      const signal = await prisma.signal.findUnique({ where: { id: signalId } });
      if (!signal) {
        return NextResponse.json(
          { error: "not_found", message: "Signal not found" },
          { status: 404 }
        );
      }

      await prisma.signal.update({
        where: { id: signalId },
        data: { status: "PENDING" },
      });

      try {
        await inngest.send({
          name: "signal/analysis.requested",
          data: { signalId },
        });
      } catch (err) {
        log.error("admin.signals.reanalyze.async.inngest_failed", { signalId, error: String(err) });
      }

      await logAuditEvent({
        userId: session.user.id,
        action: "content.signal.reanalyze",
        resource: "signal",
        resourceId: signalId,
        details: { success: true, mode: "async" },
        request: req,
      });

      log.info("admin.signals.reanalyze.async.success", { signalId });
      return NextResponse.json({ success: true, signalId, mode: "async" });
    }

    // Multiple signals async mode: trigger via Inngest
    if (signalIds && signalIds.length > 0 && mode === "async") {
      log.info("admin.signals.reanalyze.multi.start", { count: signalIds.length, force });

      const signals = await prisma.signal.findMany({ where: { id: { in: signalIds } } });
      if (signals.length === 0) {
        return NextResponse.json(
          { error: "not_found", message: "No signals found" },
          { status: 404 }
        );
      }

      if (force) {
        await prisma.signal.updateMany({
          where: { id: { in: signals.map((s) => s.id) } },
          data: { status: "PENDING" },
        });
      }

      const batchSize = 50;
      let sent = 0;
      for (let i = 0; i < signals.length; i += batchSize) {
        const batch = signals.slice(i, i + batchSize);
        await Promise.all(
          batch.map((signal) =>
            inngest.send({
              name: "signal/analysis.requested",
              data: { signalId: signal.id },
            })
          )
        );
        sent += batch.length;
      }

      await logAuditEvent({
        userId: session.user.id,
        action: "content.signal.reanalyze",
        resource: "signal",
        resourceId: signals[0].id,
        details: { success: true, mode: "async", count: sent, force },
        request: req,
      });

      log.info("admin.signals.reanalyze.multi.success", { count: sent, force });
      return NextResponse.json({ success: true, count: sent, mode: "async", force });
    }

    // Bulk mode: re-trigger signals (optionally filtered by companyId)
    // When force=true, re-analyze ALL signals regardless of status
    log.info("admin.signals.reanalyze.bulk.start", { companyId, force });

    let resetCount = { count: 0 };
    if (!force) {
      const resetWhere: Record<string, unknown> = {
        status: { in: ["LOW_QUALITY", "NON_ENGLISH"] },
      };
      if (companyId) {
        resetWhere.companyId = companyId;
      }
      resetCount = await prisma.signal.updateMany({
        where: resetWhere,
        data: { status: "PENDING" },
      });
    }

    const statusFilter = force
      ? { in: ["PENDING", "FAILED", "ANALYZED", "LOW_QUALITY", "NON_ENGLISH"] }
      : { in: ["PENDING", "FAILED"] };

    const where: Record<string, unknown> = { status: statusFilter };
    if (companyId) {
      where.companyId = companyId;
    }

    const targetSignals = await prisma.signal.findMany({
      where,
      select: { id: true, title: true, companyId: true, status: true },
      take: 1000, // Limit to prevent memory issues
    });

    if (targetSignals.length === 0 && resetCount.count === 0) {
      return NextResponse.json({
        success: true,
        message: "No signals to re-analyze",
        retriggeredCount: 0,
      });
    }

    // Reset statuses to PENDING so the pipeline picks them up
    if (force && targetSignals.length > 0) {
      await prisma.signal.updateMany({
        where: { id: { in: targetSignals.map((s) => s.id) } },
        data: { status: "PENDING" },
      });
    }

    const batchSize = 50;
    let sent = 0;

    for (let i = 0; i < targetSignals.length; i += batchSize) {
      const batch = targetSignals.slice(i, i + batchSize);
      await Promise.all(
        batch.map((signal) =>
          inngest.send({
            name: "signal/analysis.requested",
            data: { signalId: signal.id },
          })
        )
      );
      sent += batch.length;
    }

    const analyzedCount = targetSignals.filter((s) => s.status === "ANALYZED").length;
    const pendingCount = targetSignals.filter((s) => s.status === "PENDING").length;
    const failedCount = targetSignals.filter((s) => s.status === "FAILED").length;

    log.info("admin.signals.reanalyze.bulk.queued", {
      force,
      resetLowQuality: resetCount.count,
      totalQueued: targetSignals.length,
      analyzed: analyzedCount,
      pending: pendingCount,
      failed: failedCount,
      retriggered: sent,
      companyId,
    });

    const forceMsg = force ? ` (force mode: ${analyzedCount} already-analyzed signals included)` : "";
    return NextResponse.json({
      success: true,
      message: `Re-triggered analysis for ${sent} signal${sent !== 1 ? "s" : ""}${forceMsg} (${resetCount.count} reset from filtered, ${pendingCount} pending, ${failedCount} failed)`,
      retriggeredCount: sent,
      resetCount: resetCount.count,
      pendingCount,
      failedCount,
      analyzedCount: force ? analyzedCount : 0,
      companyId: companyId ?? null,
      mode: "async",
      force,
    });
  } catch (error) {
    log.error("admin.signals.reanalyze.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to re-trigger analysis" },
      { status: 500 }
    );
  }
}
