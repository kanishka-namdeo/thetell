import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "forbidden", message: "Admin access required" },
      { status: 403 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id },
  });

  if (!company) {
    return NextResponse.json(
      { error: "not_found", message: `Company ${id} not found` },
      { status: 404 }
    );
  }

  try {
    logger.info("enrichment.manual_trigger", {
      companyId: id,
      triggeredBy: session.user.id,
    });

    await inngest.send({
      name: "company/enrichment.requested",
      data: { companyId: id },
    });

    logger.info("enrichment.event_sent", { companyId: id });

    return NextResponse.json(
      {
        message: "Enrichment queued",
        companyId: id,
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error("enrichment.event_failed", {
      companyId: id,
      error: String(error),
    });

    return NextResponse.json(
      { error: "enrichment_failed", message: "Failed to queue enrichment" },
      { status: 500 }
    );
  }
}
