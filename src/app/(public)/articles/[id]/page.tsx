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

  const article = await prisma.article.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!article || article.status !== "PUBLISHED") {
    notFound();
  }

  // Fetch analyses associated with this article
  const analysisIds = Array.isArray(article.analysisIds) ? article.analysisIds : [];
  const analyses = analysisIds.length > 0
    ? await prisma.analysis.findMany({
        where: { id: { in: analysisIds as string[] } },
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
        {/* Container width increased for overall page, prose text self-constrained above */}
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
              {article.company.name}
            </Badge>
            <Badge
              variant={article.agentPersona === "ANALYST" ? "default" : "accent"}
            >
              {article.agentPersona === "ANALYST" ? "The Analyst" : "Gossip Girl"}
            </Badge>
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
