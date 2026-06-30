import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const VALID_STATUSES = ["EMERGING", "DEVELOPING", "CONFIRMED", "REFUTED", "RESOLVED"] as const;

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().nullable().default(null),
  companyId: z.string().nullable().default(null),
  status: z.enum(VALID_STATUSES).nullable().default(null),
  sortBy: z.enum(["confidence", "createdAt"]).default("confidence"),
  includeEvidenceChain: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/inferences" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = QuerySchema.parse(rawParams);
    const { limit, cursor, companyId, status, sortBy, includeEvidenceChain } = parsed;

    log.info("api.request.start", { method: "GET", path: "/api/v1/inferences", companyId, status, limit, sortBy, includeEvidenceChain });

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    const items = await prisma.inference.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, ticker: true, slug: true } },
        theme: { select: { id: true, label: true, status: true, momentum: true } },
        debate: {
          select: {
            id: true,
            consensusReached: true,
            finalConfidence: true,
            status: true,
            analystClaim: true,
            gossipClaim: true,
          },
        },
      },
      orderBy: [{ [sortBy]: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    let results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    if (includeEvidenceChain) {
      results = await Promise.all(
        results.map(async (inference) => {
          const supportingIds = (inference.supportingSignalIds as string[]) || [];
          if (supportingIds.length === 0) {
            return { ...inference, evidenceChain: [] };
          }

          const signals = await prisma.signal.findMany({
            where: { id: { in: supportingIds } },
            select: {
              id: true,
              title: true,
              sourceType: true,
              analyses: {
                select: {
                  keyFacts: true,
                  confidence: true,
                },
              },
            },
          });

          const evidenceChain = signals.map((signal) => {
            const analysis = signal.analyses[0];
            return {
              signalId: signal.id,
              signalTitle: signal.title,
              sourceType: signal.sourceType,
              facts: analysis?.keyFacts || [],
              confidence: analysis?.confidence || 0,
            };
          });

          return { ...inference, evidenceChain };
        })
      );
    }

    log.info("api.request.success", { count: results.length, hasMore });
    return NextResponse.json({ items: results, nextCursor, hasMore });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid query parameters", details: error.flatten() },
        { status: 400 },
      );
    }
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch inferences" },
      { status: 500 },
    );
  }
}
