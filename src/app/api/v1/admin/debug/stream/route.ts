import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_PASSWORD || "debug-agent-secret";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { error: "Invalid input", message: "Session ID required" },
        { status: 400 }
      );
    }

    const eventRes = await fetch(
      `${OPENCODE_URL}/session/${sessionId}/events`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64")}`,
          Accept: "text/event-stream",
        },
      }
    );

    if (!eventRes.ok || !eventRes.body) {
      throw new Error(`Failed to connect to event stream: ${eventRes.statusText}`);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = eventRes.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (error) {
          console.error("Stream error:", error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Debug stream error:", error);
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
