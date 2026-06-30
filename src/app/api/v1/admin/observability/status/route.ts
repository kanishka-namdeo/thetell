import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const enabled = process.env.LANGFUSE_ENABLED === "true";
  const baseUrl = process.env.LANGFUSE_BASE_URL || "http://localhost:3001";

  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      baseUrl,
      health: null,
      stats: { traces24h: 0, generations24h: 0, totalTokens: 0, estimatedCost: 0 },
    });
  }

  let health = null;
  let traces24h = 0;
  let generations24h = 0;

  try {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;

    if (!publicKey || !secretKey) {
      logger.warn("observability.api.missing_keys");
      return NextResponse.json({
        enabled: true,
        baseUrl,
        health: null,
        stats: { traces24h: 0, generations24h: 0, totalTokens: 0, estimatedCost: 0 },
      });
    }

    const authHeader = "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

    const healthRes = await fetch(`${baseUrl}/api/public/health`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (healthRes.ok) {
      health = await healthRes.json();
    }

    const tracesRes = await fetch(`${baseUrl}/api/public/traces?limit=1`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (tracesRes.ok) {
      const tracesData = await tracesRes.json();
      traces24h = tracesData.meta?.totalItems ?? 0;
    }

    const observationsRes = await fetch(`${baseUrl}/api/public/observations?limit=1`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (observationsRes.ok) {
      const obsData = await observationsRes.json();
      generations24h = obsData.meta?.totalItems ?? 0;
    }
  } catch (err) {
    logger.warn("observability.api.fetch_failed", { error: String(err) });
  }

  return NextResponse.json({
    enabled: true,
    baseUrl,
    health,
    stats: { traces24h, generations24h, totalTokens: 0, estimatedCost: 0 },
  });
}
