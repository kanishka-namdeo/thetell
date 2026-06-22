import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_PASSWORD || "debug-agent-secret";

export async function POST(
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
    const { message } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Invalid input", message: "Session ID required" },
        { status: 400 }
      );
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Invalid input", message: "Follow-up message required" },
        { status: 400 }
      );
    }

    // Find the debug session in database
    const debugSession = await prisma.debugSession.findFirst({
      where: {
        opencodeSessionId: id,
        userId: session.user.id,
      },
    });

    if (!debugSession) {
      return NextResponse.json(
        { error: "not_found", message: "Debug session not found" },
        { status: 404 }
      );
    }

    // Send follow-up prompt to OpenCode
    const promptRes = await fetch(
      `${OPENCODE_URL}/session/${id}/prompt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}`,
        },
        body: JSON.stringify({
          parts: [
            {
              type: "text",
              text: message,
            },
          ],
        }),
      }
    );

    if (!promptRes.ok) {
      throw new Error(`Failed to send follow-up: ${promptRes.statusText}`);
    }

    // Update session status back to running
    await prisma.debugSession.update({
      where: { id: debugSession.id },
      data: {
        status: "running",
        completedAt: null,
      },
    });

    return NextResponse.json({
      status: "sent",
      sessionId: id,
    });
  } catch (error) {
    console.error("Debug follow-up error:", error);
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
