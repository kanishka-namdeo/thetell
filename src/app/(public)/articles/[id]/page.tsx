import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Container, Section, Headline, Badge, Metadata, Card, CardContent, CardHeader, CardTitle } from "@/components";
import { SafeMarkdown } from "@/components/dashboard/safe-markdown";
import { SignupPrompt } from "../../_components/signup-prompt";
import { ShareButton } from "@/components/dashboard/share-button";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface ArticleDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { id } = await params;

  // Try fetching as per-signal article first
  const article = await prisma.article.findUnique({
    where: { id },
    include: { company: true },
  });

  // If found and published, render as per-signal article
  if (article && article.status === "PUBLISHED") {
    return <PerSignalArticleDetail article={article} />;
  }

  // If not found, try fetching as cluster article
  const clusterArticle = await prisma.clusterArticle.findUnique({
    where: { id },
    include: {
      company: true,
      theme: {
        include: {
          clusteredSignals: {
            include: {
              analyses: {
                select: { keyFacts: true, agentPersona: true },
              },
            },
            orderBy: { scrapedAt: "desc" },
          },
        },
      },
    },
  });

  if (clusterArticle && clusterArticle.status === "PUBLISHED") {
    return <ClusterArticleDetail clusterArticle={clusterArticle} />;
  }

  notFound();
}

// Per-signal article detail (existing logic)
async function PerSignalArticleDetail({ article }: { article: any }) {
  // Fetch analyses associated with this article
  const analysisIds = Array.isArray(article.analysisIds) ? article.analysisIds : [];
  const analyses = analysisIds.length > 0
    ? await prisma.analysis.findMany({
        where: { id: { in: analysisIds as string[] } },
        select: {
          id: true,
          signalId: true,
          agentPersona: true,
          sentiment: true,
          sentimentData: true,
          keyFacts: true,
          strategicThemes: true,
          summary: true,
          sourceMatchPreference: true,
        },
      })
    : [];

  const firstAnalysis = analyses[0];

  // Extract key takeaways from analyses
  const takeaways: string[] = [];

  for (const analysis of analyses) {
    // Top fact by confidence/tell_strength
    const keyFacts = Array.isArray(analysis.keyFacts) ? analysis.keyFacts : [];
    if (keyFacts.length > 0) {
      const sortedFacts = [...keyFacts].sort((a, b) => {
        const aConf = typeof a === "object" && a !== null
          ? ("confidence" in a ? (a as { confidence: number }).confidence : 0)
          : 0;
        const bConf = typeof b === "object" && b !== null
          ? ("tell_strength" in b ? (b as { tell_strength: number }).tell_strength :
             "confidence" in b ? (b as { confidence: number }).confidence : 0)
          : 0;
        return bConf - aConf;
      });
      const topFact = sortedFacts[0];
      if (topFact && typeof topFact === "object" && "text" in topFact) {
        takeaways.push((topFact as { text: string }).text);
      }
    }

    // Primary strategic theme
    const themes = Array.isArray(analysis.strategicThemes) ? analysis.strategicThemes : [];
    if (themes.length > 0) {
      const topTheme = themes[0];
      if (topTheme && typeof topTheme === "object" && "label" in topTheme) {
        takeaways.push(`Key theme: ${(topTheme as { label: string }).label}`);
      }
    }

    // Sentiment summary
    if (analysis.agentPersona === "ANALYST" && analysis.sentiment) {
      const sentimentData = analysis.sentimentData as { sentiment?: string; strength?: string } | null;
      const sentimentLabel = sentimentData?.sentiment || (analysis.sentiment as string);
      const strength = sentimentData?.strength || "";
      takeaways.push(`Market sentiment is ${strength.toLowerCase()} ${sentimentLabel.toLowerCase()} based on analysis`);
    } else if (analysis.agentPersona === "GOSSIP_GIRL" && analysis.sentiment) {
      const sentimentData = analysis.sentimentData as { surface_reading?: string } | null;
      const surfaceReading = sentimentData?.surface_reading || "";
      if (surfaceReading) {
        const labels: Record<string, string> = {
          "bullish-spin": "bullish",
          "bearish-subtext": "bearish",
          "neutral-surface": "neutral",
          "mixed-signals": "mixed",
        };
        takeaways.push(`Surface reading suggests ${labels[surfaceReading] || surfaceReading} sentiment`);
      }
    }

    // Key implication from summary
    if (analysis.summary) {
      const firstSentence = analysis.summary.split(/[.!?]/)[0];
      if (firstSentence && firstSentence.length > 10) {
        takeaways.push(firstSentence.trim());
      }
    }
  }

  // Limit to 4 takeaways
  const displayTakeaways = takeaways.slice(0, 4);

  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Section>
      <Container className="max-w-4xl">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        {/* Article Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="outline">
              {article.company.name}
            </Badge>
            <Badge
              variant={article.agentPersona === "ANALYST" ? "default" : "accent"}
            >
              {article.agentPersona === "ANALYST" ? "The Analyst" : "Gossip Girl"}
            </Badge>
            {analyses.some((a) => a.sourceMatchPreference) && (
              <Badge variant="secondary" className="text-xs">
                Preferred Source
              </Badge>
            )}
          </div>
          <Headline level={1} size="hero" className="mb-4">
            {article.title}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            {publishedDate && <Metadata>{publishedDate}</Metadata>}
            {firstAnalysis && (
              <Link
                href={`/signals/${firstAnalysis.signalId}`}
                className="inline-flex items-center gap-1 text-sm text-foreground hover:text-muted-foreground transition-colors"
              >
                View Source Signal
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            <div className="ml-auto">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Key Takeaways */}
        {displayTakeaways.length > 0 && (
          <Card className="mb-8 border-l-4 border-l-primary bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">Key Takeaways</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {displayTakeaways.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Article Content */}
        <div className="prose prose-neutral max-w-none [&>p]:max-w-[65ch] [&>p]:leading-relaxed [&>p]:mx-auto">
          <SafeMarkdown content={article.body} />
        </div>

        {/* Signup Prompt */}
        <SignupPrompt />
      </Container>
    </Section>
  );
}

// Cluster article detail (new)
async function ClusterArticleDetail({ clusterArticle }: { clusterArticle: any }) {
  const publishedDate = clusterArticle.publishedAt
    ? new Date(clusterArticle.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // Extract top facts from all signals in the cluster
  const allFacts: Array<{ text: string; signalId: string; signalTitle: string }> = [];
  for (const signal of clusterArticle.theme.clusteredSignals) {
    for (const analysis of signal.analyses) {
      const keyFacts = Array.isArray(analysis.keyFacts) ? analysis.keyFacts : [];
      for (const fact of keyFacts) {
        if (fact && typeof fact === "object" && "text" in fact) {
          allFacts.push({
            text: (fact as { text: string }).text,
            signalId: signal.id,
            signalTitle: signal.title,
          });
        }
      }
    }
  }

  // Limit to top 8 facts
  const displayFacts = allFacts.slice(0, 8);

  return (
    <Section>
      <Container className="max-w-4xl">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        {/* Article Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline">
              {clusterArticle.company.name}
            </Badge>
            <Badge
              variant={clusterArticle.agentPersona === "ANALYST" ? "default" : "accent"}
            >
              {clusterArticle.agentPersona === "ANALYST" ? "The Analyst" : "Gossip Girl"}
            </Badge>
            <Badge variant="secondary">
              Cluster Article
            </Badge>
            <Badge variant="outline">
              Built from {clusterArticle.signalCount} signal{clusterArticle.signalCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <Headline level={1} size="hero" className="mb-4">
            {clusterArticle.title}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            {publishedDate && <Metadata>{publishedDate}</Metadata>}
            <Link
              href={`/clusters/${clusterArticle.theme.id}`}
              className="inline-flex items-center gap-1 text-sm text-foreground hover:text-muted-foreground transition-colors"
            >
              View Cluster
              <ArrowRight className="h-3 w-3" />
            </Link>
            <div className="ml-auto">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Source Signals */}
        {clusterArticle.theme.clusteredSignals.length > 0 && (
          <Card className="mb-8 border-l-4 border-l-primary bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">Source Signals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {clusterArticle.theme.clusteredSignals.slice(0, 10).map((signal: any) => (
                  <Link
                    key={signal.id}
                    href={`/signals/${signal.id}`}
                    className="block p-3 border border-border hover:bg-muted/50 transition-colors rounded"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{signal.title}</p>
                        <Metadata>
                          {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </Metadata>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {signal.sourceType}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Facts Provenance */}
        {displayFacts.length > 0 && (
          <Card className="mb-8 border-l-4 border-l-accent bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">Key Facts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {displayFacts.map((fact, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent mt-1">•</span>
                    <div className="flex-1">
                      <span>{fact.text}</span>
                      <div className="mt-1">
                        <Link
                          href={`/signals/${fact.signalId}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          From: {fact.signalTitle}
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Article Content */}
        <div className="prose prose-neutral max-w-none [&>p]:max-w-[65ch] [&>p]:leading-relaxed [&>p]:mx-auto">
          <SafeMarkdown content={clusterArticle.body} />
        </div>

        {/* Signup Prompt */}
        <SignupPrompt />
      </Container>
    </Section>
  );
}
