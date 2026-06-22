import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const signal = await prisma.signal.findUnique({
      where: { id },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    // Reset status to PENDING
    await prisma.signal.update({
      where: { id },
      data: { status: "PENDING" },
    });

    // Trigger analysis via Inngest
    try {
      await inngest.send({
        name: "signal/analysis.requested",
        data: { signalId: id },
      });
    } catch (err) {
      logger.error("reanalyze.inngest_trigger_failed", { signalId: id, error: String(err) });
    }

    return NextResponse.json({ success: true, signalId: id });
  } catch (error) {
    logger.error("reanalyze.request_failed", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to re-analyze signal" },
      { status: 500 }
    );
  }
}
