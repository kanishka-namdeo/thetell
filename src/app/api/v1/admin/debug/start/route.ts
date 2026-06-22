import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { collectSystemContext, formatSystemContext } from "@/lib/debug/context-collector";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_PASSWORD || "debug-agent-secret";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    const { problem, context } = await req.json();

    if (!problem || typeof problem !== "string") {
      return NextResponse.json(
        { error: "Invalid input", message: "Problem description required" },
        { status: 400 }
      );
    }

    // Collect system context automatically
    const systemContext = await collectSystemContext();
    const formattedSystemContext = formatSystemContext(systemContext);

    // Combine user-provided context with system context
    const combinedContext = context
      ? `${context}\n\n${formattedSystemContext}`
      : formattedSystemContext;

    const createRes = await fetch(`${OPENCODE_URL}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}`,
      },
      body: JSON.stringify({
        title: `Debug: ${problem.slice(0, 50)}`,
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create session: ${createRes.statusText}`);
    }

    const opencodeSession = await createRes.json();

    const promptRes = await fetch(
      `${OPENCODE_URL}/session/${opencodeSession.id}/prompt`,
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
              text: combinedContext
                ? `${problem}\n\nAdditional context:\n${combinedContext}`
                : problem,
            },
          ],
        }),
      }
    );

    if (!promptRes.ok) {
      throw new Error(`Failed to send prompt: ${promptRes.statusText}`);
    }

    // Persist session to database
    await prisma.debugSession.create({
      data: {
        opencodeSessionId: opencodeSession.id,
        problem,
        context: combinedContext || null,
        status: "running",
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      sessionId: opencodeSession.id,
      status: "started",
    });
  } catch (error) {
    console.error("Debug start error:", error);
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
