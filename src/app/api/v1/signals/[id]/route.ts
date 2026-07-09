import { NextRequest, NextResponse } from "next/server";
import { AgentPersona } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/signals/[id]" });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const agentPersona = searchParams.get("agentPersona") as AgentPersona | null;

    log.info("api.request.start", { method: "GET", path: `/api/v1/signals/${id}` });

    const signal = await prisma.signal.findUnique({
      where: { id },
      include: {
        company: true,
        analyses: agentPersona
          ? { where: { agentPersona } }
          : true,
      },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    log.info("api.request.success", {
      signalId: id,
      analysesCount: signal.analyses.length,
    });

    return NextResponse.json(signal);
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch signal" },
      { status: 500 }
    );
  }
}
