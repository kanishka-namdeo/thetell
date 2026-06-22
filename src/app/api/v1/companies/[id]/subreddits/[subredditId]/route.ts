import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const SubredditUpdateSchema = z.object({
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subredditId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id, subredditId } = await params;

    const existing = await prisma.trackedSubreddit.findUnique({
      where: { id: subredditId },
    });

    if (!existing || existing.companyId !== id) {
      return NextResponse.json(
        { error: "not_found", message: "Tracked subreddit not found for this company" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parseResult = SubredditUpdateSchema.safeParse(body);

    if (!parseResult.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const key = issue.path.join(".");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return NextResponse.json(
        { error: "validation_error", message: "Invalid request body", details },
        { status: 400 }
      );
    }

    const updated = await prisma.trackedSubreddit.update({
      where: { id: subredditId },
      data: {
        ...(parseResult.data.isActive !== undefined && { isActive: parseResult.data.isActive }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Error updating tracked subreddit", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update tracked subreddit" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subredditId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id, subredditId } = await params;

    const existing = await prisma.trackedSubreddit.findUnique({
      where: { id: subredditId },
    });

    if (!existing || existing.companyId !== id) {
      return NextResponse.json(
        { error: "not_found", message: "Tracked subreddit not found for this company" },
        { status: 404 }
      );
    }

    await prisma.trackedSubreddit.delete({
      where: { id: subredditId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error deleting tracked subreddit", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete tracked subreddit" },
      { status: 500 }
    );
  }
}
