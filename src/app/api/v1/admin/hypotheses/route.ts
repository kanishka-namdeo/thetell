import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const CreateSchema = z.object({
  companyId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: z.number().min(0).max(1).optional().default(0.5),
});

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "CONFIRMED", "REFUTED"]).optional(),
  priority: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/hypotheses" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.hypotheses.list.start");

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);

    const hypotheses = await prisma.companyHypothesis.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { confidence: "desc" },
        { createdAt: "desc" },
      ],
      take: limit,
    });

    log.info("admin.hypotheses.list.success", { count: hypotheses.length });

    return NextResponse.json({ data: hypotheses });
  } catch (error) {
    log.error("admin.hypotheses.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch hypotheses" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/hypotheses" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid hypothesis data",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.info("admin.hypotheses.create.start", { companyId: parsed.data.companyId });

    const hypothesis = await prisma.companyHypothesis.create({
      data: {
        companyId: parsed.data.companyId,
        title: parsed.data.title,
        description: parsed.data.description,
        confidence: parsed.data.priority,
        status: "ACTIVE",
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    log.info("admin.hypotheses.create.success", { hypothesisId: hypothesis.id });

    return NextResponse.json({ data: hypothesis }, { status: 201 });
  } catch (error) {
    log.error("admin.hypotheses.create.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create hypothesis" },
      { status: 500 }
    );
  }
}
