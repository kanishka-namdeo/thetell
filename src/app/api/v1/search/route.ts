import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateEmbedding } from "@/lib/nlp/embedding-generator";
import { semanticSearch } from "@/lib/nlp/embedding-store";
import { logger } from "@/lib/logger";

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

    if (q.length > 500) {
      return NextResponse.json(
        { error: "query_too_long", message: "Query must be 500 characters or less" },
        { status: 400 }
      );
    }

    // Only perform semantic search (embedding generation) for authenticated users
    const shouldSearchType = (t: string) => !type || type === t;

    // Run text search and semantic search in parallel
    const [
      [textSignals, companies, articles, inferences, themes],
      semanticResults,
    ] = await Promise.all([
      Promise.all([
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
              select: {
                id: true,
                title: true,
                rawContent: true,
                scrapedAt: true,
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
              select: {
                id: true,
                title: true,
                publishedAt: true,
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
              select: {
                id: true,
                title: true,
                hypothesis: true,
                confidence: true,
                company: { select: { id: true, name: true, ticker: true, slug: true } },
                theme: { select: { id: true, label: true, status: true } },
              },
              orderBy: { confidence: "desc" },
            })
          : Promise.resolve([]),
        shouldSearchType("theme")
          ? prisma.signalTheme.findMany({
              where: {
                label: { contains: q, mode: "insensitive" },
              },
              take: 5,
              select: {
                id: true,
                label: true,
                companyId: true,
                momentum: true,
                company: { select: { name: true } },
                signals: { select: { id: true } },
              },
              orderBy: { momentum: "desc" },
            })
          : Promise.resolve([]),
      ]),
      // Semantic search runs in parallel with text search
      session?.user
        ? generateEmbedding(q)
            .then((emb) => semanticSearch(emb, 10))
            .catch((embedError) => {
              logger.warn("Semantic search failed, falling back to text search", {
                error: String(embedError),
              });
              return [];
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

    const formattedThemes = themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      companyId: theme.companyId,
      company: theme.company,
      signalCount: theme.signals.length,
      momentum: theme.momentum,
    }));

    return NextResponse.json({
      signals: combinedSignals,
      companies,
      articles,
      inferences,
      themes: formattedThemes,
    });
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
