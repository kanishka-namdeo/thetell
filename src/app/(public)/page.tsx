import { prisma } from "@/lib/db";
import { Container, Section, Headline, Body, Badge, Card, CardContent, CardHeader, CardTitle, Metadata } from "@/components";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { FeedContent } from "./_components/feed-content";
import { TrendingThemes } from "./_components/trending-themes";
import { LoadMoreButton } from "./_components/load-more-button";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface PublicFeedPageProps {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function PublicFeedPage({ searchParams }: PublicFeedPageProps) {
  const { cursor } = await searchParams;
  const PAGE_SIZE = 20;

  const [recentSignals, topInference, recentArticles, signalCount] = await Promise.all([
    prisma.signal.findMany({
      take: PAGE_SIZE + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { scrapedAt: "desc" },
      where: { status: "ANALYZED" },
      include: {
        company: true,
        analyses: true,
      },
    }),
    prisma.analysis.findMany({
      take: 1,
      orderBy: { confidence: "desc" },
      include: {
        signal: {
          include: { company: true },
        },
      },
    }),
    prisma.article.findMany({
      take: 5,
      orderBy: { publishedAt: "desc" },
      where: { status: "PUBLISHED" },
      include: { company: true },
    }),
    prisma.signal.count({ where: { status: "ANALYZED" } }),
  ]);

  const hasMore = recentSignals.length > PAGE_SIZE;
  const signals = hasMore ? recentSignals.slice(0, PAGE_SIZE) : recentSignals;
  const nextCursor = hasMore ? signals[signals.length - 1].id : null;

  const heroInference = topInference[0] || null;

  return (
    <>
      {/* Hero Inference */}
      {heroInference && (
        <Section className="border-b-4 border-foreground">
          <Container>
            <Badge variant="accent" className="mb-4">
              Top Inference
            </Badge>
            <Card className="border-2 border-foreground">
              <CardHeader>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <CardTitle className="text-2xl">
                    <Link
                      href={`/signals/${heroInference.signalId}`}
                      className="hover:underline"
                    >
                      {heroInference.signal.title}
                    </Link>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={heroInference.agentPersona === "ANALYST" ? "default" : "accent"}
                    >
                      {heroInference.agentPersona === "ANALYST" ? "The Analyst" : "Gossip Girl"}
                    </Badge>
                    <ConfidenceBand confidence={heroInference.confidence} />
                    <SentimentIndicator
                      sentiment={heroInference.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                    />
                  </div>
                </div>
                <Badge variant="outline" className="w-fit">
                  {heroInference.signal.company.name}
                </Badge>
              </CardHeader>
              {heroInference.summary && (
                <CardContent>
                  <Body className="text-base text-muted-foreground">
                    {heroInference.summary}
                  </Body>
                </CardContent>
              )}
            </Card>
          </Container>
        </Section>
      )}

      {/* Main Feed */}
      <Section texture>
        <Container>
          <div className="mb-8">
            <Metadata className="mb-2">Latest Signals</Metadata>
            <Headline level={2} size="section">
              Recent Intelligence
            </Headline>
            <Metadata className="mt-2">{signalCount} signals analyzed</Metadata>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              {/* Signal Feed */}
              <Suspense fallback={<div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded" />
              ))}</div>}>
                <FeedContent signals={signals} />
              </Suspense>

              {/* Load More */}
              {hasMore && nextCursor && (
                <div className="flex justify-center mt-6">
                  <LoadMoreButton cursor={nextCursor} />
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <TrendingThemes />

              {/* Recent Articles */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Articles</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentArticles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No articles published yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentArticles.map((article) => (
                        <div key={article.id} className="border-l-2 border-foreground pl-3">
                          <Link
                            href={`/articles/${article.id}`}
                            className="text-sm font-serif font-medium hover:underline"
                          >
                            {article.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[9px]">
                              {article.company.name}
                            </Badge>
                            {article.publishedAt && (
                              <Metadata>
                                {new Date(article.publishedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </Metadata>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
