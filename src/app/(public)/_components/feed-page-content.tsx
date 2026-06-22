import { prisma } from "@/lib/db";
import { Container, Section, Headline, Body, Badge, Card, CardContent, CardHeader, CardTitle, Metadata } from "@/components";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { FeedContent } from "./feed-content";
import { TrendingThemes } from "./trending-themes";
import { LoadMoreButton } from "./load-more-button";
import Link from "next/link";

interface FeedPageContentProps {
  cursor?: string;
}

export async function FeedPageContent({ cursor }: FeedPageContentProps) {
  const PAGE_SIZE = 20;

  const [recentSignals, heroInference, activeInferences, recentArticles, signalCount] = await Promise.all([
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
    prisma.inference.findFirst({
      where: { status: { in: ["EMERGING", "DEVELOPING"] } },
      orderBy: { confidence: "desc" },
      include: {
        company: { select: { id: true, name: true, ticker: true, slug: true } },
        theme: true,
      },
    }),
    prisma.inference.findMany({
      take: 5,
      orderBy: { confidence: "desc" },
      where: { status: { in: ["EMERGING", "DEVELOPING", "CONFIRMED"] } },
      include: {
        company: { select: { id: true, name: true, ticker: true, slug: true } },
        theme: true,
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
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <CardTitle className="text-xl md:text-2xl">
                    <Link
                      href={`/inferences/${heroInference.id}`}
                      className="hover:underline"
                    >
                      {heroInference.title}
                    </Link>
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={heroInference.status === "EMERGING" ? "outline" : "default"}
                    >
                      {heroInference.status}
                    </Badge>
                    <ConfidenceBand confidence={heroInference.confidence} />
                    {heroInference.theme && (
                      <Badge variant="secondary" className="text-xs">
                        {heroInference.theme.label}
                      </Badge>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="w-fit">
                  {heroInference.company.name}
                  {heroInference.company.ticker && ` (${heroInference.company.ticker})`}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0 pb-6 px-6">
                <Body className="text-base text-muted-foreground leading-relaxed">
                  {heroInference.hypothesis}
                </Body>
              </CardContent>
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
              <FeedContent signals={signals} />

              {hasMore && nextCursor && (
                <div className="flex justify-center mt-6">
                  <LoadMoreButton cursor={nextCursor} />
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <TrendingThemes />

              {/* Active Inferences */}
              {activeInferences.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Active Inferences</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {activeInferences.map((inference) => (
                        <Link
                          key={inference.id}
                          href={`/inferences/${inference.id}`}
                          className="block border-l-2 border-foreground pl-3 py-2 hover:bg-muted/50 transition-colors"
                        >
                          <p className="text-sm font-medium line-clamp-2">
                            {inference.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[11px]">
                              {inference.company.name}
                            </Badge>
                            <ConfidenceBand confidence={inference.confidence} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

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
                            <Badge variant="outline" className="text-[11px]">
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
