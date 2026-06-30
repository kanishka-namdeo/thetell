/**
 * DeepAgent Code Interpreter API
 *
 * Manages the QuickJS code interpreter configuration.
 *
 * GET  - Get interpreter status
 * POST - Enable/disable interpreter
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { z } from "zod";

// In-memory state for interpreter (would be persisted in production)
let interpreterEnabled = false;

export async function GET() {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    log.info("deepagent.interpreter.status");
    return NextResponse.json({
      data: {
        enabled: interpreterEnabled,
        runtime: "quickjs",
        tools: ["eval"],
      },
    });
  } catch (error) {
    log.error("deepagent.interpreter.get.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const toggleSchema = z.object({
  enabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = toggleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    interpreterEnabled = parsed.data.enabled;

    log.info("deepagent.interpreter.toggle", { enabled: interpreterEnabled });
    return NextResponse.json({
      data: {
        enabled: interpreterEnabled,
        message: interpreterEnabled
          ? "Code interpreter enabled"
          : "Code interpreter disabled",
      },
    });
  } catch (error) {
    log.error("deepagent.interpreter.post.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
