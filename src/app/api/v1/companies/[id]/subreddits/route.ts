import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { validateSubreddit } from "@/lib/reddit/subreddit-discovery";

const SubredditCreateSchema = z.object({
  subreddit: z
    .string()
    .min(1, "Subreddit name is required")
    .regex(/^[a-zA-Z0-9_]+$/, "Subreddit must be alphanumeric with underscores, no r/ prefix"),
});

export async function GET(
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

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);

    const [items, discoveryLog] = await Promise.all([
      prisma.trackedSubreddit.findMany({
        where: { companyId: id },
        take: limit,
        orderBy: { discoveredAt: "desc" },
      }),
      prisma.subredditDiscoveryLog.findFirst({
        where: { companyId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ items, discoveryLog });
  } catch (error) {
    logger.error("Error fetching tracked subreddits", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch tracked subreddits" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const parseResult = SubredditCreateSchema.safeParse(body);

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

    const { subreddit } = parseResult.data;
    const subredditName = subreddit.toLowerCase();

    const validation = await validateSubreddit(subredditName);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "invalid_subreddit", message: "Subreddit does not exist or RSS feed is unavailable" },
        { status: 400 }
      );
    }

    try {
      const tracked = await prisma.trackedSubreddit.create({
        data: {
          companyId: id,
          subreddit: subredditName,
          subscriberCount: validation.subscriberCount ?? null,
        },
      });

      return NextResponse.json(tracked, { status: 201 });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "conflict", message: "Subreddit is already tracked for this company" },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error adding tracked subreddit", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to add tracked subreddit" },
      { status: 500 }
    );
  }
}
