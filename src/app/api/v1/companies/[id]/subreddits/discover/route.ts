import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    await inngest.send({
      name: "company.subreddits.discover",
      data: { companyId: id },
    });

    return NextResponse.json(
      { message: "Discovery started" },
      { status: 202 }
    );
  } catch (error) {
    logger.error("Error triggering subreddit discovery", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to trigger subreddit discovery" },
      { status: 500 }
    );
  }
}
