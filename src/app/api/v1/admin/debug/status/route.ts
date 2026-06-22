import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_PASSWORD || "debug-agent-secret";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    // Check if OpenCode backend is reachable
    const healthRes = await fetch(`${OPENCODE_URL}/health`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!healthRes.ok) {
      return NextResponse.json({
        backend: "disconnected",
        message: "OpenCode backend is not responding",
      });
    }

    // Try to get active sessions count
    let activeSessions = 0;
    try {
      const sessionsRes = await fetch(`${OPENCODE_URL}/sessions`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        activeSessions = Array.isArray(sessions) ? sessions.length : 0;
      }
    } catch {
      // Sessions endpoint might not exist, that's okay
    }

    return NextResponse.json({
      backend: "connected",
      activeSessions,
      message: "OpenCode backend is available",
    });
  } catch (error) {
    return NextResponse.json({
      backend: "disconnected",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
