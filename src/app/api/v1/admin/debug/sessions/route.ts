import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !isAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Admin access required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    const [sessions, total] = await Promise.all([
      prisma.debugSession.findMany({
        where: { userId: session.user.id },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          opencodeSessionId: true,
          problem: true,
          status: true,
          eventCount: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      prisma.debugSession.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({
      sessions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Debug sessions list error:", error);
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
