import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { Container, Section, Headline, Body, Badge, Card, CardContent, CardHeader, CardTitle, Metadata } from "@/components";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { FeedContent } from "./feed-content";
import { FeedClusterCard } from "./feed-cluster-card";
import { TrendingThemes } from "./trending-themes";
import { LoadMoreButton } from "./load-more-button";
import { CollapsibleSidebarWidget } from "./collapsible-sidebar-widget";
import { ViewToggle } from "./view-toggle";
import { TacticalFeedContent } from "./tactical-feed-content";
import { SourceTypeFilter } from "./source-type-filter";
import { ConsensusFilterToggle } from "./consensus-filter-toggle";
import { calculateConsensus } from "../signals/[id]/consensus-badge";
import { MissedDigest } from "./missed-digest";
import { ActivityHeatmap } from "./activity-heatmap";
import { ThemeEvolutionTracker } from "./theme-evolution-tracker";
import Link from "next/link";

interface FeedPageContentProps {
  cursor?: string;
  view?: string;
  sourceType?: string;
  highConsensus?: boolean;
}

interface ThemeData {
  label: string;
  count: number;
}

function extractThemesFromSignals(signals: Array<{ analyses: Array<{ strategicThemes: unknown }> }>): ThemeData[] {
  const themeCounts = new Map<string, number>();

  for (const signal of signals) {
    for (const analysis of signal.analyses) {
      if (!Array.isArray(analysis.strategicThemes)) continue;

      for (const theme of analysis.strategicThemes) {
        const label =
          typeof theme === "object" && theme !== null && "label" in theme
            ? (theme as { label: string }).label
            : String(theme);
        themeCounts.set(label, (themeCounts.get(label) || 0) + 1);
      }
    }
  }

  return Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));
}

export async function FeedPageContent({ cursor, view, sourceType, highConsensus }: FeedPageContentProps) {
  const PAGE_SIZE = 20;

  // Read last_visit cookie for missed digest
  const cookieStore = await cookies();
  const lastVisitCookie = cookieStore.get("last_visit");
  const lastVisit = lastVisitCookie?.value;

  // Build where clause for signals
  const signalWhere: Prisma.SignalWhereInput = { status: "ANALYZED" };
  if (sourceType) {
    signalWhere.sourceType = sourceType as Prisma.EnumSourceTypeFilter;
  }

  const [
    recentSignals,
    activeClusters,
    heroInference,
    activeInferences,
    recentArticles,
    signalCount,
    tacticalInferencesRaw,
    tacticalArticlesRaw,
    companies,
    sourceTypeCounts,
    missedDigestData,
    themeEvolutionData,
  ] = await Promise.all([
    prisma.signal.findMany({
      take: PAGE_SIZE + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { scrapedAt: "desc" },
      where: signalWhere,
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        scrapedAt: true,
        publishedAt: true,
        verified: true,
        feedLabel: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        analyses: {
          select: {
            confidence: true,
            sentiment: true,
            sentimentData: true,
            agentPersona: true,
            strategicThemes: true,
          },
        },
        cluster: {
          select: {
            id: true,
            label: true,
            momentum: true,
            _count: { select: { clusteredSignals: true } },
          },
        },
      },
    }),
    prisma.signalTheme.findMany({
      where: {
        status: { in: ["EMERGING", "ACCELERATING"] },
      },
      include: {
        company: { select: { id: true, name: true, ticker: true } },
        _count: { select: { clusteredSignals: true } },
      },
      orderBy: { momentum: "desc" },
      take: 5,
    }),
    prisma.inference.findFirst({
      where: { status: { in: ["EMERGING", "DEVELOPING"] } },
      orderBy: { confidence: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        confidence: true,
        hypothesis: true,
        company: { select: { id: true, name: true, ticker: true, slug: true } },
        theme: { select: { id: true, label: true } },
      },
    }),
    prisma.inference.findMany({
      take: 5,
      orderBy: { confidence: "desc" },
      where: { status: { in: ["EMERGING", "DEVELOPING", "CONFIRMED"] } },
      select: {
        id: true,
        title: true,
        confidence: true,
        company: { select: { id: true, name: true, ticker: true, slug: true } },
      },
    }),
    prisma.article.findMany({
      take: 5,
      orderBy: { publishedAt: "desc" },
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.signal.count({ where: signalWhere }),
    prisma.inference.findMany({
      take: 30,
      orderBy: { confidence: "desc" },
      where: { status: { in: ["EMERGING", "DEVELOPING", "CONFIRMED"] } },
      include: {
        company: { select: { id: true, name: true, ticker: true } },
        theme: { select: { id: true, label: true, status: true, momentum: true } },
        _count: { select: { articles: true } },
      },
    }),
    prisma.article.findMany({
      take: 20,
      orderBy: { publishedAt: "desc" },
      where: { status: "PUBLISHED" },
      include: {
        company: { select: { id: true, name: true, ticker: true } },
      },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Source type counts
    prisma.signal.groupBy({
      by: ["sourceType"],
      where: { status: "ANALYZED" },
      _count: { id: true },
    }),
    // Company signal counts
    // Missed digest data
    lastVisit
      ? prisma.signal.findMany({
          where: {
            status: "ANALYZED",
            scrapedAt: { gt: new Date(lastVisit) },
          },
          include: { company: { select: { name: true } } },
          take: 100,
        })
      : Promise.resolve([]),
    // Theme evolution data
    prisma.signalTheme.findMany({
      where: {
        status: { in: ["EMERGING", "ACCELERATING", "PEAKED", "FADING"] },
      },
      select: {
        id: true,
        label: true,
        status: true,
        momentum: true,
        _count: { select: { signals: true } },
      },
      orderBy: { momentum: "desc" },
      take: 5,
    }),
  ]);

  const hasMore = recentSignals.length > PAGE_SIZE;
  // Sort by effective date (publishedAt preferred over scrapedAt) for accurate temporal ordering
  const sortedSignals = recentSignals.sort((a, b) => {
    const dateA = a.publishedAt ?? a.scrapedAt;
    const dateB = b.publishedAt ?? b.scrapedAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  // Filter by consensus if requested
  const consensusFilteredSignals = highConsensus
    ? sortedSignals.filter((signal) => {
        const consensus = calculateConsensus(signal.analyses);
        return consensus === "strong-agreement";
      })
    : sortedSignals;
  const signals = hasMore ? consensusFilteredSignals.slice(0, PAGE_SIZE) : consensusFilteredSignals;
  const nextCursor = hasMore && signals.length > 0 ? signals[signals.length - 1].id : null;

  // Extract themes from the signals being displayed in the feed
  const feedThemes = extractThemesFromSignals(signals as unknown as Array<{ analyses: Array<{ strategicThemes: unknown }> }>);
  const totalUniqueThemes = feedThemes.length;

  // Determine current view
  const currentView = view === "tactical" ? "tactical" : "signal";

  // Serialize dates for tactical view client component
  const tacticalInferences = tacticalInferencesRaw.map((inf) => ({
    ...inf,
    createdAt: inf.createdAt.toISOString(),
    sourceTypesInvolved: (inf.sourceTypesInvolved as string[]) || [],
  }));

  // Compute word count for articles (for reading time)
  const tacticalArticles = tacticalArticlesRaw.map((art) => ({
    ...art,
    publishedAt: art.publishedAt?.toISOString() ?? null,
    wordCount: art.body ? art.body.split(/\s+/).length : 0,
    body: undefined, // Don't send body to client
  }));

  // Process source type counts
  const sourceTypeCountsData = sourceTypeCounts.map((item) => ({
    sourceType: item.sourceType,
    count: item._count.id,
  }));

  // Process missed digest data
  const missedDigestCount = missedDigestData.length;
  const missedDigestCompanies = missedDigestData.reduce((acc, signal) => {
    const name = signal.company.name;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const missedDigestTopCompanies = Object.entries(missedDigestCompanies)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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

      {/* What You Missed Digest */}
      {lastVisit && missedDigestCount > 0 && (
        <Section className="border-b border-foreground/20">
          <Container>
            <MissedDigest
              count={missedDigestCount}
              lastVisit={lastVisit}
              topCompanies={missedDigestTopCompanies}
            />
          </Container>
        </Section>
      )}

      {/* Main Feed */}
      <Section texture>
        <Container>
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Metadata className="mb-2">
                  {currentView === "tactical" ? "Tactical View" : "Latest Signals"}
                </Metadata>
                <Headline level={2} size="section">
                  Recent Intelligence
                </Headline>
                <Metadata className="mt-2">{signalCount} signals analyzed</Metadata>
              </div>
              <ViewToggle currentView={currentView} />
            </div>
          </div>

          {currentView === "tactical" ? (
            <>
              <SourceTypeFilter sourceTypeCounts={sourceTypeCountsData} />
              <div className="mt-6">
                <TacticalFeedContent
                  inferences={tacticalInferences}
                  articles={tacticalArticles}
                  companies={companies}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <SourceTypeFilter sourceTypeCounts={sourceTypeCountsData} />
                <div className="mt-2">
                  <ConsensusFilterToggle />
                </div>
                <div className="mt-6">
                  <FeedContent signals={signals as unknown as Parameters<typeof FeedContent>[0]['signals']} />
                </div>

                {hasMore && nextCursor && (
                  <div className="flex justify-center mt-6">
                    <LoadMoreButton cursor={nextCursor} />
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Active Clusters */}
                {activeClusters.length > 0 && (
                  <div className="space-y-3">
                    <Headline level={3} size="subheading">
                      Active Clusters
                    </Headline>
                    {activeClusters.map((cluster) => (
                      <FeedClusterCard key={cluster.id} cluster={cluster} />
                    ))}
                  </div>
                )}

                <TrendingThemes themes={feedThemes} totalThemes={totalUniqueThemes} />

                {/* Activity Heatmap */}
                <CollapsibleSidebarWidget
                  defaultOpen={false}
                  title={<Headline level={3} size="subheading">Activity Heatmap</Headline>}
                >
                  <ActivityHeatmap />
                </CollapsibleSidebarWidget>

                {/* Theme Evolution Tracker */}
                <CollapsibleSidebarWidget
                  defaultOpen={false}
                  title={<Headline level={3} size="subheading">Theme Evolution</Headline>}
                >
                  <ThemeEvolutionTracker themes={themeEvolutionData} />
                </CollapsibleSidebarWidget>

                {/* Active Inferences */}
                {activeInferences.length > 0 && (
                  <CollapsibleSidebarWidget
                    defaultOpen={true}
                    title={<Headline level={3} size="subheading">Active Inferences</Headline>}
                  >
                    <Card>
                      <CardContent className="pt-4">
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
                  </CollapsibleSidebarWidget>
                )}

                {/* Recent Articles */}
                <CollapsibleSidebarWidget
                  defaultOpen={true}
                  title={<Headline level={3} size="subheading">Recent Articles</Headline>}
                >
                  <Card>
                    <CardContent className="pt-4">
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
                </CollapsibleSidebarWidget>
              </div>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}
