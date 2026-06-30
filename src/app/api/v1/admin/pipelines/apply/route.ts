import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/pipelines/apply" });

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

    let body: { sessionId?: string; companyId?: string | null };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { sessionId, companyId } = body;
    if (!sessionId) {
      return NextResponse.json(
        { error: "bad_request", message: "sessionId is required" },
        { status: 400 }
      );
    }

    log.info("admin.pipelines.apply.start", { sessionId, companyId });

    const discoverySession = await prisma.pipelineDiscoverySession.findFirst({
      where: {
        OR: [{ id: sessionId }, { sessionId }],
      },
      include: {
        discoveredSources: {
          where: { verified: true },
        },
      },
    });

    if (!discoverySession) {
      return NextResponse.json(
        { error: "not_found", message: "Session not found" },
        { status: 404 }
      );
    }

    const targetCompanyId = companyId || discoverySession.companyId;
    if (!targetCompanyId) {
      return NextResponse.json(
        { error: "bad_request", message: "No company ID available" },
        { status: 400 }
      );
    }

    const applied = [];
    const errors = [];

    for (const source of discoverySession.discoveredSources) {
      try {
        const existing = await prisma.companyDataSource.findFirst({
          where: {
            url: source.url,
            companyId: targetCompanyId,
          },
        });

        if (existing) {
          await prisma.companyDataSource.update({
            where: { id: existing.id },
            data: {
              sourceType: source.sourceType,
              label: source.label,
              discoveryMethod: "pipeline-orchestrator",
              isActive: true,
            },
          });
        } else {
          await prisma.companyDataSource.create({
            data: {
              url: source.url,
              sourceType: source.sourceType,
              label: source.label,
              companyId: targetCompanyId,
              discoveryMethod: "pipeline-orchestrator",
              isActive: true,
            },
          });
        }
        applied.push(source.url);
      } catch (error) {
        errors.push({
          url: source.url,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    log.info("admin.pipelines.apply.success", {
      applied: applied.length,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      applied: applied.length,
      errors: errors.map((e) => `${e.url}: ${e.error}`),
    });
  } catch (error) {
    log.error("admin.pipelines.apply.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to apply sources" },
      { status: 500 }
    );
  }
}
