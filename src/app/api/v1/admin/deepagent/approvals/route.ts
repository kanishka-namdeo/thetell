import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId query parameter is required" },
        { status: 400 }
      );
    }

    const approvals = await prisma.deepAgentApproval.findMany({
      where: {
        sessionId,
        status: "pending",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        toolName: true,
        toolInput: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: approvals });
  } catch (error) {
    log.error("deepagent.approvals.list_error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch pending approvals" },
      { status: 500 }
    );
  }
}
