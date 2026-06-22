import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateEmbedding } from "@/lib/nlp/embedding-generator";
import { semanticSearch } from "@/lib/nlp/embedding-store";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const type = searchParams.get("type")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({
        signals: [],
        companies: [],
        articles: [],
        inferences: [],
      });
    }

    // Only perform semantic search (embedding generation) for authenticated users
    let semanticResults: Array<{ id: string; title: string; similarity: number }> = [];
    if (session?.user) {
      try {
        const queryEmbedding = await generateEmbedding(q);
        semanticResults = await semanticSearch(queryEmbedding, 10);
      } catch (embedError) {
        logger.warn("Semantic search failed, falling back to text search", {
          error: String(embedError),
        });
      }
    }

    const shouldSearchType = (t: string) => !type || type === t;

    // Text-based search
    const [textSignals, companies, articles, inferences] = await Promise.all([
      shouldSearchType("signal")
        ? prisma.signal.findMany({
            where: {
              status: "ANALYZED",
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { rawContent: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
            include: {
              company: { select: { id: true, name: true } },
            },
            orderBy: { scrapedAt: "desc" },
          })
        : Promise.resolve([]),
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
      shouldSearchType("article")
        ? prisma.article.findMany({
            where: {
              status: "PUBLISHED",
              title: { contains: q, mode: "insensitive" },
            },
            take: 5,
            include: {
              company: { select: { id: true, name: true } },
            },
            orderBy: { publishedAt: "desc" },
          })
        : Promise.resolve([]),
      shouldSearchType("inference")
        ? prisma.inference.findMany({
            where: {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { hypothesis: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 5,
            include: {
              company: { select: { id: true, name: true, ticker: true, slug: true } },
              theme: { select: { id: true, label: true, status: true } },
            },
            orderBy: { confidence: "desc" },
          })
        : Promise.resolve([]),
    ]);

    // Hybrid search: combine semantic and text results
    // 60% semantic, 40% text match
    const combinedSignals = combineSearchResults(
      semanticResults,
      textSignals,
      5
    );

    return NextResponse.json({
      signals: combinedSignals,
      companies,
      articles,
      inferences,
    });
  } catch (error) {
    logger.error("Public search error", { error: String(error) });
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
  textResults: Array<{ id: string; title: string; rawContent: string; scrapedAt: Date; company: { id: string; name: string } }>,
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
    const recencyBonus = Math.max(0, 1 - daysSinceScraped / 30); // 30-day decay
    const textScore = 0.4 + recencyBonus * 0.1; // Base 40% + up to 10% recency bonus

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
