import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const QuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/jobs" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    log.info("admin.jobs.list.start", { query });

    const where: Record<string, unknown> = {};

    if (query.status && query.status !== "all") {
      where.status = query.status;
    }

    if (query.type && query.type !== "all") {
      where.type = query.type;
    }

    const [jobs, total, pending, running, completed, failed] = await Promise.all([
      prisma.job.findMany({
        where,
        take: query.limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.job.count(),
      prisma.job.count({ where: { status: "pending" } }),
      prisma.job.count({ where: { status: "running" } }),
      prisma.job.count({ where: { status: "completed" } }),
      prisma.job.count({ where: { status: "failed" } }),
    ]);

    const completedJobs = await prisma.job.findMany({
      where: { status: "completed", duration: { not: null } },
      select: { duration: true },
      take: 100,
    });

    const avgDuration =
      completedJobs.length > 0
        ? completedJobs.reduce((sum, j) => sum + (j.duration || 0), 0) / completedJobs.length
        : 0;

    const successRate = total > 0 ? (completed / total) * 100 : 0;

    const stats = {
      total,
      pending,
      running,
      completed,
      failed,
      avgDuration,
      successRate,
    };

    log.info("admin.jobs.list.success", { count: jobs.length, stats });

    return NextResponse.json({ jobs, stats });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid query parameters",
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.error("admin.jobs.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
