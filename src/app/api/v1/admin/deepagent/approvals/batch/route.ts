import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveApproval } from "@/lib/deepagent/approval-waiter";

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { approvalIds, action, reason } = body;

    if (!Array.isArray(approvalIds) || approvalIds.length === 0) {
      return NextResponse.json(
        { error: "approvalIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const decision = action === "approve" ? "approved" : "rejected";

    // Verify all approvals exist and are pending
    const approvals = await prisma.deepAgentApproval.findMany({
      where: {
        id: { in: approvalIds },
        status: "pending",
      },
      select: {
        id: true,
        status: true,
      },
    });

    const validIds = new Set(approvals.map((a) => a.id));
    const invalidIds = approvalIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      log.warn("deepagent.approvals.batch.invalid_ids", {
        invalidIds,
        userId: session.user.id,
      });
    }

    // Process valid approvals
    let succeeded = 0;
    let failed = 0;

    for (const approvalId of validIds) {
      try {
        await prisma.deepAgentApproval.update({
          where: { id: approvalId },
          data: {
            status: decision,
            decidedBy: session.user.id,
            decidedAt: new Date(),
          },
        });

        // Signal the waiting stream to resume
        resolveApproval(approvalId, decision);

        succeeded++;

        log.info("deepagent.approval.batch.decision", {
          approvalId,
          decision,
          userId: session.user.id,
          reason,
        });
      } catch (error) {
        failed++;
        log.error("deepagent.approval.batch.process_error", {
          approvalId,
          error: String(error),
        });
      }
    }

    return NextResponse.json({
      processed: approvalIds.length,
      succeeded,
      failed,
      invalidIds,
    });
  } catch (error) {
    log.error("deepagent.approvals.batch_error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to process batch approval" },
      { status: 500 }
    );
  }
}
