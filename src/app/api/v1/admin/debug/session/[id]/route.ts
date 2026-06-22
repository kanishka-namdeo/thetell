import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_PASSWORD || "debug-agent-secret";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invalid input", message: "Session ID required" },
        { status: 400 }
      );
    }

    // Cancel backend session
    const deleteRes = await fetch(`${OPENCODE_URL}/session/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!deleteRes.ok) {
      const status = deleteRes.status;
      if (status === 404) {
        return NextResponse.json(
          { error: "not_found", message: "Session not found on backend" },
          { status: 404 }
        );
      }
      throw new Error(`Backend returned ${status}: ${deleteRes.statusText}`);
    }

    // Update database record
    await prisma.debugSession.updateMany({
      where: { opencodeSessionId: id, userId: session.user.id },
      data: { status: "cancelled", completedAt: new Date() },
    });

    return NextResponse.json({
      status: "cancelled",
      sessionId: id,
    });
  } catch (error) {
    console.error("Debug session cancel error:", error);
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { status, eventCount } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Invalid input", message: "Session ID required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (typeof eventCount === "number") updateData.eventCount = eventCount;
    if (status && ["completed", "failed", "cancelled"].includes(status)) {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.debugSession.updateMany({
      where: { opencodeSessionId: id, userId: session.user.id },
      data: updateData,
    });

    return NextResponse.json({
      updated: updated.count,
    });
  } catch (error) {
    console.error("Debug session update error:", error);
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
