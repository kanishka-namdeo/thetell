import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateEmbedding } from "@/lib/nlp/embedding-generator";
import { semanticSearch } from "@/lib/nlp/embedding-store";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2 || q.length > 500) {
      return NextResponse.json({
        signals: [],
        companies: [],
        articles: [],
      });
    }

    // Perform semantic search if embeddings are available
    let semanticResults: Array<{ id: string; title: string; similarity: number }> = [];
    try {
      const queryEmbedding = await generateEmbedding(q);
      semanticResults = await semanticSearch(queryEmbedding, 10);
    } catch (embedError) {
      logger.warn("Semantic search failed, falling back to text search", {
        error: String(embedError),
      });
    }

    // Text-based search
    const [textSignals, companies, articles] = await Promise.all([
      prisma.signal.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { rawContent: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        include: {
          company: { select: { name: true } },
        },
        orderBy: { scrapedAt: "desc" },
      }),
      prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { ticker: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { name: "asc" },
      }),
      prisma.article.findMany({
        where: {
          title: { contains: q, mode: "insensitive" },
        },
        take: 5,
        include: {
          company: { select: { name: true } },
        },
        orderBy: { publishedAt: "desc" },
      }),
    ]);

    // Hybrid search: combine semantic and text results
    const combinedSignals = combineSearchResults(
      semanticResults,
      textSignals,
      5
    );

    return NextResponse.json({ signals: combinedSignals, companies, articles });
  } catch (error) {
    logger.error("Search error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Search failed" },
      { status: 500 }
    );
  }
}

/**
 * Combine semantic and text search results with weighted scoring.
 * 60% semantic similarity, 40% text match (recency bonus for text).
 */
function combineSearchResults(
  semanticResults: Array<{ id: string; title: string; similarity: number }>,
  textResults: Array<{ id: string; title: string; rawContent: string; scrapedAt: Date; company: { name: string } }>,
  limit: number
) {
  const scoreMap = new Map<string, { signal: typeof textResults[0]; score: number }>();

  // Add semantic results (60% weight)
  for (const result of semanticResults) {
    const textResult = textResults.find((t) => t.id === result.id);
    if (textResult) {
      scoreMap.set(result.id, {
        signal: textResult,
        score: result.similarity * 0.6,
      });
    }
  }

  // Add text results (40% weight + recency bonus)
  const now = new Date();
  for (const result of textResults) {
    const daysSinceScraped = Math.max(
      0,
      (now.getTime() - result.scrapedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const recencyBonus = Math.max(0, 1 - daysSinceScraped / 30);
    const textScore = 0.4 + recencyBonus * 0.1;

    const existing = scoreMap.get(result.id);
    if (existing) {
      existing.score += textScore;
    } else {
      scoreMap.set(result.id, { signal: result, score: textScore });
    }
  }

  // Sort by combined score and return top results
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.signal);
}
