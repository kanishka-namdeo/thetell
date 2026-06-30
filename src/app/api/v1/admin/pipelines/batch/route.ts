import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/pipelines/batch" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    let body: { companyIds?: string[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { companyIds } = body;
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "companyIds must be a non-empty array" },
        { status: 400 }
      );
    }

    log.info("admin.pipelines.batch.start", { companyCount: companyIds.length });

    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });

    const sessions = [];
    const errors = [];

    // Send single unified discovery event for all companies
    try {
      await inngest.send({
        name: "signal/discovery.requested",
        data: {
          companyIds: companies.map((c) => c.id),
          mode: "manual",
          hypothesisAware: true,
          stealthFallback: false,
        },
      });

      for (const company of companies) {
        const sessionId = crypto.randomUUID();
        await prisma.pipelineDiscoverySession.create({
          data: {
            sessionId,
            userId: session!.user.id,
            companyName: company.name,
            companyId: company.id,
            status: "running",
          },
        });
        sessions.push({
          companyId: company.id,
          companyName: company.name,
          sessionId,
          status: "started",
        });
      }
    } catch (error) {
      for (const company of companies) {
        errors.push({
          companyId: company.id,
          companyName: company.name,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    log.info("admin.pipelines.batch.success", {
      sessionsStarted: sessions.length,
      errors: errors.length,
    });

    return NextResponse.json({
      sessions: [...sessions, ...errors],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error("admin.pipelines.batch.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to start batch discovery" },
      { status: 500 }
    );
  }
}
