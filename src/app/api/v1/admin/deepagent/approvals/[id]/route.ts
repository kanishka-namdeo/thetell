import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveApproval } from "@/lib/deepagent/approval-waiter";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();
    const { decision } = body;

    if (!decision || !["approved", "rejected"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision. Must be 'approved' or 'rejected'." },
        { status: 400 }
      );
    }

    // Update the approval record
    const approval = await prisma.deepAgentApproval.update({
      where: { id },
      data: {
        status: decision,
        decidedBy: session.user.id,
        decidedAt: new Date(),
      },
    });

    log.info("deepagent.approval.decision", {
      approvalId: id,
      decision,
      userId: session.user.id,
    });

    // Signal the waiting stream to resume
    resolveApproval(id, decision);

    return NextResponse.json({ success: true, approval });
  } catch (error) {
    log.error("deepagent.approval.error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to process approval decision" },
      { status: 500 }
    );
  }
}
