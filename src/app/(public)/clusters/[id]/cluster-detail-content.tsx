import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import {
  Container,
  Section,
  Headline,
  Body,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Metadata,
} from "@/components";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { MomentumIndicator } from "@/components/dashboard/momentum-indicator";
import { SignupPrompt } from "../../_components/signup-prompt";
import { ShareButton } from "@/components/dashboard/share-button";
import { cosineSimilarity } from "@/lib/nlp/embedding-generator";
import { logger } from "@/lib/logger";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Layers } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  EMERGING: "Emerging",
  ACCELERATING: "Accelerating",
  PEAKED: "Peaked",
  FADING: "Fading",
  RESOLVED: "Resolved",
};

interface ClusterDetailContentProps {
  id: string;
}

export async function ClusterDetailContent({ id }: ClusterDetailContentProps) {
  const cluster = await prisma.signalTheme.findUnique({
    where: { id },
    include: {
      company: {
        select: { id: true, name: true, ticker: true, slug: true },
      },
      signals: {
        include: {
          analyses: {
            select: {
              id: true,
              confidence: true,
              sentiment: true,
              agentPersona: true,
            },
          },
        },
        orderBy: { scrapedAt: "desc" },
      },
    },
  });

  if (!cluster) {
    notFound();
  }

  // Build evidence chain
  const evidenceChain = cluster.signals.map((signal) => {
    const analysis = signal.analyses[0];
    return {
      signalId: signal.id,
      signalTitle: signal.title,
      sourceType: signal.sourceType,
      scrapedAt: signal.scrapedAt,
      confidence: analysis?.confidence || 0,
      sentiment: analysis?.sentiment || "NEUTRAL",
      agentPersona: analysis?.agentPersona || "ANALYST",
    };
  });

  // Get cluster summary if available
  const clusterSummary = cluster.clusterSummary as {
    summary?: string;
    keyFacts?: string[];
    themes?: string[];
    implication?: string;
    momentumHistory?: number[];
  } | null;

  // Strategic implication - use clusterSummary if available
  const implication = clusterSummary?.implication;

  // Load related clusters (same company, high embedding similarity)
  let relatedClusters: Array<{
    id: string;
    label: string;
    status: string;
    momentum: number;
  }> = [];

  if (cluster.embedding) {
    try {
      const allCompanyClusters = await prisma.signalTheme.findMany({
        where: {
          companyId: cluster.companyId,
          id: { not: cluster.id },
          status: { in: ["EMERGING", "ACCELERATING", "PEAKED"] },
        },
        select: { id: true, label: true, status: true, momentum: true, embedding: true },
      });

      relatedClusters = allCompanyClusters
        .filter((c) => {
          if (!c.embedding) return false;
          return cosineSimilarity(
            cluster.embedding as number[],
            c.embedding as number[]
          ) > 0.6;
        })
        .sort((a, b) => b.momentum - a.momentum)
        .slice(0, 5);
    } catch (error) {
      logger.warn("cluster_detail.related_clusters_failed", {
        clusterId: cluster.id,
        error: String(error),
      });
    }
  }

  return (
    <Section className="overflow-x-hidden">
      <Container className="max-w-4xl">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        {/* Cluster Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <Badge variant="outline" className="mb-3">
            {cluster.company.name}
            {cluster.company.ticker && ` (${cluster.company.ticker})`}
          </Badge>
          <Headline level={1} size="hero" className="mb-4">
            {cluster.label}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={cluster.status === "ACCELERATING" ? "default" : "secondary"}>
              {STATUS_LABELS[cluster.status] ?? cluster.status}
            </Badge>
            <MomentumIndicator
              momentum={cluster.momentum}
              status={cluster.status}
              signalCount={cluster.signals.length}
              momentumHistory={clusterSummary?.momentumHistory}
            />
            <Badge variant="outline" className="gap-1">
              <Layers className="h-3 w-3" />
              {cluster.signals.length} signals
            </Badge>
            <div className="ml-auto flex-shrink-0">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Strategic Implication */}
        {implication && (
          <Card className="mb-6 border-l-4 border-l-primary">
            <CardContent className="pt-4">
              <Metadata className="mb-2">Strategic Implication</Metadata>
              <Body className="text-base font-serif">{implication}</Body>
            </CardContent>
          </Card>
        )}

        {/* Cluster Summary */}
        {clusterSummary?.summary && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Cluster Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Body>{clusterSummary.summary}</Body>
              {clusterSummary.keyFacts && clusterSummary.keyFacts.length > 0 && (
                <div>
                  <Metadata className="mb-2">Key Facts</Metadata>
                  <ul className="space-y-1">
                    {clusterSummary.keyFacts.map((fact, idx) => (
                      <li key={idx} className="text-sm border-l-2 border-foreground pl-3">
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {clusterSummary.themes && clusterSummary.themes.length > 0 && (
                <div>
                  <Metadata className="mb-2">Themes</Metadata>
                  <div className="flex flex-wrap gap-2">
                    {clusterSummary.themes.map((theme, idx) => (
                      <Badge key={idx} variant="outline">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Description fallback */}
        {!clusterSummary?.summary && cluster.description && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>About This Cluster</CardTitle>
            </CardHeader>
            <CardContent>
              <Body>{cluster.description}</Body>
            </CardContent>
          </Card>
        )}

        {/* Evidence Chain - removed (EvidenceChain component deprecated) */}

        {/* Related Clusters */}
        {relatedClusters.length > 0 && (
          <div className="mb-6 space-y-4">
            <Headline level={2} size="section">Related Clusters</Headline>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {relatedClusters.map((related) => (
                <Link key={related.id} href={`/clusters/${related.id}`}>
                  <Card className="border-2 border-foreground hover:bg-muted/50 transition-colors h-full">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif text-sm font-semibold line-clamp-2">
                            {related.label}
                          </h3>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {STATUS_LABELS[related.status] ?? related.status}
                        </Badge>
                      </div>
                      <div className="mt-2">
                        <MomentumIndicator
                          momentum={related.momentum}
                          status={related.status}
                          signalCount={0}
                          showLabel={false}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Signals in Cluster */}
        {cluster.signals.length > 0 && (
          <div className="mb-6 space-y-4">
            <Headline level={2} size="section">
              All Signals ({cluster.signals.length})
            </Headline>
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {cluster.signals.map((signal) => (
                    <Link
                      key={signal.id}
                      href={`/signals/${signal.id}`}
                      className="block border-l-2 border-foreground pl-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{signal.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {signal.sourceType}
                            </Badge>
                            <Metadata>
                              {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </Metadata>
                            {signal.analyses.length > 0 && (
                              <ConfidenceBand
                                confidence={Math.max(...signal.analyses.map((a) => a.confidence))}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Signup Prompt */}
        <SignupPrompt />
      </Container>
    </Section>
  );
}
