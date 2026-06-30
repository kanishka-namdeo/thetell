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
import { CrossSignalDebateView } from "@/components/dashboard/cross-signal-debate";
import { EvidenceChain } from "@/components/dashboard/evidence-chain";
import { SignupPrompt } from "../../_components/signup-prompt";
import { ShareButton } from "@/components/dashboard/share-button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  EMERGING: "Emerging",
  DEVELOPING: "Developing",
  CONFIRMED: "Confirmed",
  REFUTED: "Refuted",
  RESOLVED: "Resolved",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive" | "accent"
> = {
  EMERGING: "outline",
  DEVELOPING: "default",
  CONFIRMED: "accent",
  REFUTED: "destructive",
  RESOLVED: "secondary",
};

export async function InferenceDetailContent({ id }: { id: string }) {
  const inference = await prisma.inference.findUnique({
    where: { id },
    include: {
      company: {
        select: { id: true, name: true, ticker: true, slug: true },
      },
      theme: true,
      calibrations: {
        orderBy: { predictedAt: "desc" },
      },
      debate: true,
      articles: {
        select: {
          id: true,
          title: true,
          slug: true,
          agentPersona: true,
          status: true,
        },
      },
    },
  });

  if (!inference) notFound();

  const supportingIds = Array.isArray(inference.supportingSignalIds)
    ? (inference.supportingSignalIds as string[])
    : [];
  const contradictingIds = Array.isArray(inference.contradictingSignalIds)
    ? (inference.contradictingSignalIds as string[])
    : [];
  const allSignalIds = [...new Set([...supportingIds, ...contradictingIds])];

  const signals =
    allSignalIds.length > 0
      ? await prisma.signal.findMany({
          where: { id: { in: allSignalIds } },
          select: {
            id: true,
            title: true,
            sourceType: true,
            scrapedAt: true,
            analyses: {
              select: {
                confidence: true,
                sentiment: true,
                agentPersona: true,
              },
              take: 1,
            },
          },
          orderBy: { scrapedAt: "desc" },
        })
      : [];

  // Build evidence chain from supporting signals
  const evidenceChain = signals
    .filter((s) => supportingIds.includes(s.id))
    .map((signal) => {
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

  const sourceTypesInvolved = Array.isArray(inference.sourceTypesInvolved)
    ? (inference.sourceTypesInvolved as string[])
    : [];

  const scrapedDate = new Date(inference.createdAt).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

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

        {/* Inference Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <Badge
            variant="outline"
            className="mb-3"
          >
            {inference.company.name}
            {inference.company.ticker && ` (${inference.company.ticker})`}
          </Badge>
          <Headline level={1} size="hero" className="mb-4">
            {inference.title}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={STATUS_VARIANTS[inference.status] ?? "outline"}>
              {STATUS_LABELS[inference.status] ?? inference.status}
            </Badge>
            <Metadata>{scrapedDate}</Metadata>
            <ConfidenceBand confidence={inference.confidence} />
            {inference.theme && (
              <MomentumIndicator
                momentum={inference.theme.momentum}
                status={inference.theme.status}
                signalCount={supportingIds.length}
                showLabel={false}
              />
            )}
            <div className="ml-auto flex-shrink-0">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Hypothesis */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Hypothesis</CardTitle>
          </CardHeader>
          <CardContent>
            <Body className="whitespace-pre-wrap">{inference.hypothesis}</Body>
          </CardContent>
        </Card>

        {/* Strategic Theme */}
        {inference.theme && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Strategic Theme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{inference.theme.label}</Badge>
                <MomentumIndicator
                  momentum={inference.theme.momentum}
                  status={inference.theme.status}
                  signalCount={supportingIds.length}
                />
              </div>
              {inference.theme.description && (
                <Body className="text-sm text-muted-foreground">
                  {inference.theme.description}
                </Body>
              )}
            </CardContent>
          </Card>
        )}

        {/* Predicted Outcome */}
        {inference.predictedOutcome && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Predicted Outcome</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Body>{inference.predictedOutcome}</Body>
              {inference.wasCorrect !== null && (
                <div className="flex items-center gap-2">
                  {inference.wasCorrect ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <Badge variant="default">Confirmed</Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      <Badge variant="destructive">Refuted</Badge>
                    </>
                  )}
                  {inference.resolvedAt && (
                    <Metadata>
                      Resolved{" "}
                      {new Date(inference.resolvedAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}
                    </Metadata>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Evidence Chain */}
        {evidenceChain.length > 0 && (
          <div className="mb-6">
            <EvidenceChain
              items={evidenceChain}
              inferenceTitle={inference.title}
              inferenceConfidence={inference.confidence}
            />
          </div>
        )}

        {/* Cross-Signal Debate */}
        {inference.debate && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-3">
              <Headline level={2} size="section">
                Agent Debate
              </Headline>
            </div>
            <CrossSignalDebateView
              consensusReached={inference.debate.consensusReached}
              debate={{
                analyst: {
                  claim: inference.debate.analystClaim,
                  evidence: (inference.debate.analystEvidence as string[]) || [],
                  confidence: inference.debate.analystConfidence,
                },
                gossipGirl: {
                  claim: inference.debate.gossipClaim,
                  evidence: (inference.debate.gossipEvidence as string[]) || [],
                  tellStrength: inference.debate.gossipTellStrength,
                },
                agreements: (inference.debate.agreements as string[]) || [],
                contentions:
                  (inference.debate.contentions as Array<{
                    topic: string;
                    analystView: string;
                    gossipGirlView: string;
                    evidence?: string[];
                  }>) || [],
                synthesis: inference.debate.synthesisText,
              }}
            />
          </div>
        )}

        {/* Supporting Signals */}
        {signals.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Supporting Signals ({signals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signals.map((signal) => (
                  <Link
                    key={signal.id}
                    href={`/signals/${signal.id}`}
                    className="flex items-start gap-3 p-3 border border-border hover:bg-muted/50 transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0 mt-0.5"
                    >
                      {signal.sourceType}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {signal.title}
                      </p>
                      <time className="text-xs text-muted-foreground font-mono">
                        {new Date(signal.scrapedAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </time>
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        supportingIds.includes(signal.id)
                          ? "text-success"
                          : "text-destructive"
                      )}
                    >
                      {supportingIds.includes(signal.id)
                        ? "Supporting"
                        : "Contradicting"}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calibration History */}
        {inference.calibrations.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Calibration History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inference.calibrations.map((cal) => (
                  <div
                    key={cal.id}
                    className="border-l-2 border-foreground pl-3 py-2"
                  >
                    <Body className="text-sm mb-2">{cal.prediction}</Body>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Metadata>
                        Predicted{" "}
                        {new Date(cal.predictedAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </Metadata>
                      {cal.wasCorrect !== null && (
                        <>
                          {cal.wasCorrect ? (
                            <Badge variant="default" className="text-xs">
                              Correct
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Incorrect
                            </Badge>
                          )}
                          {cal.resolvedAt && (
                            <Metadata>
                              Resolved{" "}
                              {new Date(cal.resolvedAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </Metadata>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Related Articles */}
        {inference.articles.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Related Articles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inference.articles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/articles/${article.id}`}
                    className="flex items-center gap-3 p-3 border border-border hover:bg-muted/50 transition-colors"
                  >
                    <Badge variant="outline" className="text-xs shrink-0">
                      {article.agentPersona === "ANALYST"
                        ? "The Analyst"
                        : "Gossip Girl"}
                    </Badge>
                    <p className="text-sm font-medium truncate">
                      {article.title}
                    </p>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signup Prompt */}
        <SignupPrompt />
      </Container>
    </Section>
  );
}
