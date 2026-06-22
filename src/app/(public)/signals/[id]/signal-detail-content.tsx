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
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { SignupPrompt } from "../../_components/signup-prompt";
import { ShareButton } from "@/components/dashboard/share-button";
import { ConsensusBadge, calculateConsensus } from "./consensus-badge";
import { AnalysisSection } from "./analysis-section";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Handshake, Swords, Lightbulb, ArrowUp, User, Globe, Rss, ExternalLink, BadgeCheck } from "lucide-react";

const categoryLabels: Record<string, string> = {
  financial: "Financial",
  strategic: "Strategic",
  operational: "Operational",
  personnel: "Personnel",
  market: "Market",
};

const tellTypeLabels: Record<string, string> = {
  "power-move": "Power Move",
  "behavioral-tell": "Behavioral Tell",
  "hidden-agenda": "Hidden Agenda",
  "narrative-shift": "Narrative Shift",
  "insider-signal": "Insider Signal",
};

const surfaceReadingLabels: Record<string, string> = {
  "bullish-spin": "Bullish Spin",
  "bearish-subtext": "Bearish Subtext",
  "neutral-surface": "Neutral Surface",
  "mixed-signals": "Mixed Signals",
};

interface SignalDetailContentProps {
  id: string;
}

export async function SignalDetailContent({ id }: SignalDetailContentProps) {
  const signal = await prisma.signal.findUnique({
    where: { id },
    include: {
      company: true,
      analyses: true,
      debates: {
        take: 1,
        orderBy: { generatedAt: "desc" },
      },
    },
  });

  if (!signal || signal.status !== "ANALYZED") {
    notFound();
  }

  const scrapedDate = new Date(signal.scrapedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const analystAnalysis = signal.analyses.find(
    (a) => a.agentPersona === "ANALYST"
  );

  // Fetch related inferences
  const relatedInferences = await prisma.inference.findMany({
    where: {
      supportingSignalIds: {
        array_contains: signal.id,
      },
    },
    include: {
      company: true,
      theme: true,
    },
    take: 5,
    orderBy: { confidence: "desc" },
  });

  // Fetch current signal's themes
  const currentThemes = await prisma.signalTheme.findMany({
    where: {
      signals: {
        some: { id: signal.id },
      },
    },
    select: { id: true },
  });

  const themeIds = currentThemes.map((t) => t.id);

  // Fetch related signals (sharing themes)
  const relatedSignals =
    themeIds.length > 0
      ? await prisma.signal.findMany({
          where: {
            id: { not: signal.id },
            themes: {
              some: {
                id: { in: themeIds },
              },
            },
          },
          include: {
            company: true,
          },
          orderBy: { scrapedAt: "desc" },
          take: 10,
        })
      : [];

  // Fetch correlated signals with theme overlap count
  const correlatedSignalsRaw =
    themeIds.length > 0
      ? await prisma.signal.findMany({
          where: {
            id: { not: signal.id },
            themes: {
              some: {
                id: { in: themeIds },
              },
            },
          },
          include: {
            themes: {
              select: { id: true },
            },
          },
          take: 5,
        })
      : [];

  const correlatedSignals = correlatedSignalsRaw
    .map((s) => ({
      ...s,
      sharedThemeCount: s.themes.filter((t) => themeIds.includes(t.id)).length,
    }))
    .sort((a, b) => b.sharedThemeCount - a.sharedThemeCount);

  return (
    <Section className="overflow-x-hidden">
      <Container>
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        {/* Signal Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <Badge
            variant="outline"
            className="mb-3"
          >
            {signal.company.name}
          </Badge>
          <Headline level={1} size="section" className="mb-4">
            {signal.title}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{signal.sourceType}</Badge>
            <Metadata>{scrapedDate}</Metadata>
            {signal.analyses.length > 0 && (
              <>
                <ConfidenceBand
                  confidence={Math.max(
                    ...signal.analyses.map((a) => a.confidence)
                  )}
                />
                {analystAnalysis?.sentiment && (
                  <SentimentIndicator
                    sentiment={
                      analystAnalysis.sentiment as
                        | "POSITIVE"
                        | "NEGATIVE"
                        | "NEUTRAL"
                    }
                    strength={
                      (analystAnalysis.sentimentData as { strength?: "STRONGLY" | "MILDY" } | null)?.strength
                    }
                  />
                )}
              </>
            )}
            <div className="ml-auto flex-shrink-0">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Provenance Metadata */}
        <Card className="mb-6 bg-muted/30 border-border">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {/* Source */}
              <div className="flex items-start gap-2">
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Source</div>
                  <a
                    href={signal.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:text-primary transition-colors break-all"
                  >
                    <span className="truncate">
                      {(() => {
                        try {
                          return new URL(signal.sourceUrl).hostname.replace(/^www\./, "");
                        } catch {
                          return signal.sourceUrl;
                        }
                      })()}
                    </span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </div>
              </div>

              {/* Data Origin */}
              <div className="flex items-start gap-2">
                <Rss className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Origin</div>
                  <Badge variant="outline">
                    {signal.dataOrigin === "SCRAPED" && "Scraped"}
                    {signal.dataOrigin === "BOOTSTRAP" && "Bootstrapped"}
                    {signal.dataOrigin === "SEED" && "Seeded"}
                    {signal.dataOrigin === "MANUAL" && "User-submitted"}
                  </Badge>
                </div>
              </div>

              {/* Verified Status */}
              {signal.verified && (
                <div className="flex items-start gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</div>
                    <Badge variant="default">Verified</Badge>
                  </div>
                </div>
              )}

              {/* Scraper */}
              {signal.scraperName && (
                <div className="flex items-start gap-2">
                  <Rss className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Scraper</div>
                    <div className="text-foreground">
                      {signal.scraperName.split("-").map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(" ")}
                    </div>
                  </div>
                </div>
              )}

              {/* Feed Label */}
              {signal.feedLabel && (
                <div className="flex items-start gap-2">
                  <Rss className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Feed</div>
                    <div className="text-foreground">{signal.feedLabel}</div>
                  </div>
                </div>
              )}

              {/* Collected */}
              <div className="flex items-start gap-2">
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Collected</div>
                  <div className="text-foreground">{scrapedDate}</div>
                </div>
              </div>

              {/* Published */}
              {signal.publishedAt && (
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Published</div>
                    <div className="text-foreground">
                      {new Date(signal.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Signal Content */}
        {signal.rawContent && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Signal Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-body text-base leading-relaxed text-foreground whitespace-pre-wrap">
                {signal.rawContent}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Social Signal Metadata */}
        {signal.sourceType === "SOCIAL" && (signal.engagement || signal.metadata || signal.author) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Social Signal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {signal.author && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Metadata className="text-sm font-medium">{signal.author}</Metadata>
                </div>
              )}
              {(() => {
                const meta = signal.metadata as Record<string, string | number> | null;
                const eng = signal.engagement as { score?: number | null; comments?: number | null; upvoteRatio?: number | null; likes?: number | null; replies?: number | null } | null;
                return (
                  <>
                    {meta?.subreddit && (
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <Metadata className="text-sm">r/{meta.subreddit}</Metadata>
                      </div>
                    )}
                    {eng && (
                      <div className="grid grid-cols-3 gap-4">
                        {(eng.score ?? eng.likes) != null && (
                          <div className="flex flex-col items-center gap-1">
                            <ArrowUp className="h-5 w-5 text-muted-foreground" />
                            <Metadata className="text-sm font-semibold">{eng.score ?? eng.likes}</Metadata>
                            <Metadata className="text-xs text-muted-foreground">Upvotes</Metadata>
                          </div>
                        )}
                        {eng.comments != null && (
                          <div className="flex flex-col items-center gap-1">
                            <MessageSquare className="h-5 w-5 text-muted-foreground" />
                            <Metadata className="text-sm font-semibold">{eng.comments}</Metadata>
                            <Metadata className="text-xs text-muted-foreground">Comments</Metadata>
                          </div>
                        )}
                        {(meta?.upvoteRatio ?? eng.upvoteRatio) != null && (
                          <div className="flex flex-col items-center gap-1">
                            <Metadata className="text-sm font-semibold">{Math.round(Number(meta?.upvoteRatio ?? eng.upvoteRatio) * 100)}%</Metadata>
                            <Metadata className="text-xs text-muted-foreground">Upvote Ratio</Metadata>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Analysis Results */}
        {signal.analyses.length > 0 && (
          <>
            {/* Consensus Badge */}
            {(() => {
              const consensus = calculateConsensus(signal.analyses);
              return consensus ? (
                <div className="mb-4 flex items-center gap-2">
                  <ConsensusBadge consensus={consensus} />
                </div>
              ) : null;
            })()}

            <AnalysisSection
              analyses={signal.analyses}
              categoryLabels={categoryLabels}
              tellTypeLabels={tellTypeLabels}
              surfaceReadingLabels={surfaceReadingLabels}
            />

            {/* Debate Section */}
            {(() => {
              const debate = signal.debates[0];
              if (!debate) {
                return (
                  <Card className="mb-6 border-dashed border-2">
                    <CardContent className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                        <Metadata className="text-sm">
                          Agent Debate coming soon
                        </Metadata>
                        <p className="text-xs text-muted-foreground mt-2">
                          Watch The Analyst and Gossip Girl go head-to-head
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              const analystPos = debate.analystPosition as {
                claim: string;
                evidence: string[];
                confidence: number;
              };
              const gossipPos = debate.gossipGirlPosition as {
                claim: string;
                evidence: string[];
                tellStrength: number;
              };
              const agreements = debate.pointsOfAgreement as string[];
              const contentions = debate.pointsOfContention as Array<{
                topic: string;
                analystView: string;
                gossipGirlView: string;
                evidence: string[];
              }>;

              return (
                <div className="mb-6 space-y-6">
                  {/* Debate Header */}
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-foreground" />
                    <Headline level={2} size="section">Agent Debate</Headline>
                  </div>

                  {/* Side-by-side positions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Analyst Position */}
                    <Card className="border-l-4 border-l-agent-analyst">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <Badge variant="analyst">The Analyst</Badge>
                          <ConfidenceBand confidence={analystPos.confidence} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Metadata className="mb-2">Position</Metadata>
                          <Body className="text-sm">{analystPos.claim}</Body>
                        </div>
                        {analystPos.evidence.length > 0 && (
                          <div>
                            <Metadata className="mb-2">Evidence</Metadata>
                            <ul className="space-y-1 list-none">
                              {analystPos.evidence.map((ev, idx) => (
                                <li key={idx} className="text-sm border-l-2 border-agent-analyst pl-3">
                                  {ev}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Gossip Girl Position */}
                    <Card className="border-l-4 border-l-agent-gossip">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <Badge variant="gossip">Gossip Girl</Badge>
                          <ConfidenceBand confidence={gossipPos.tellStrength} label="Tell Strength" />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Metadata className="mb-2">The Take</Metadata>
                          <Body className="text-sm">{gossipPos.claim}</Body>
                        </div>
                        {gossipPos.evidence.length > 0 && (
                          <div>
                            <Metadata className="mb-2">The Tells</Metadata>
                            <ul className="space-y-1 list-none">
                              {gossipPos.evidence.map((ev, idx) => (
                                <li key={idx} className="text-sm border-l-2 border-agent-gossip pl-3">
                                  {ev}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Points of Agreement */}
                  {agreements.length > 0 && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Handshake className="h-4 w-4 text-success" />
                          <CardTitle>Points of Agreement</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {agreements.map((point, idx) => (
                            <Badge key={idx} variant="outline" className="text-sm">
                              {point}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Points of Contention */}
                  {contentions.length > 0 && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Swords className="h-4 w-4 text-destructive" />
                          <CardTitle>Points of Contention</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {contentions.map((contention, idx) => (
                          <div key={idx} className="border border-foreground p-4 space-y-3">
                            <Metadata className="font-semibold">{contention.topic}</Metadata>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="border-l-2 border-agent-analyst pl-3">
                                <Badge variant="analyst" className="mb-1 text-[10px]">Analyst</Badge>
                                <Body className="text-sm">{contention.analystView}</Body>
                              </div>
                              <div className="border-l-2 border-agent-gossip pl-3">
                                <Badge variant="gossip" className="mb-1 text-[10px]">Gossip Girl</Badge>
                                <Body className="text-sm">{contention.gossipGirlView}</Body>
                              </div>
                            </div>
                            {contention.evidence.length > 0 && (
                              <div>
                                <Metadata className="mb-1">Evidence</Metadata>
                                <div className="flex flex-wrap gap-1">
                                  {contention.evidence.map((ev, j) => (
                                    <Badge key={j} variant="outline" className="text-[11px]">
                                      {ev}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Synthesis */}
                  {debate.synthesis && (
                    <Card className="border-2 border-foreground bg-muted/30">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-foreground" />
                          <CardTitle>Synthesis</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Body>{debate.synthesis}</Body>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* Related Inferences */}
        {relatedInferences.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-3">
              <Headline level={2} size="section">Related Inferences</Headline>
            </div>
            <div className="space-y-3">
              {relatedInferences.map((inference) => (
                <Card key={inference.id} className="border-2 border-foreground">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <Link href={`/inferences/${inference.id}`}>
                          <h3 className="font-serif text-base font-semibold hover:underline">
                            {inference.title}
                          </h3>
                        </Link>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {inference.hypothesis}
                        </p>
                      </div>
                      <ConfidenceBand confidence={inference.confidence} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Signal Timeline */}
        {relatedSignals.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-3">
              <Headline level={2} size="section">Signal Timeline</Headline>
            </div>
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {relatedSignals.map((related) => (
                    <Link
                      key={related.id}
                      href={`/signals/${related.id}`}
                      className="block border-l-2 border-foreground pl-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{related.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {related.sourceType}
                            </Badge>
                            <Metadata>
                              {new Date(related.scrapedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </Metadata>
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

        {/* Correlated Signals */}
        {correlatedSignals.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-3">
              <Headline level={2} size="section">Correlated Signals</Headline>
            </div>
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {correlatedSignals.map((correlated) => (
                    <Link
                      key={correlated.id}
                      href={`/signals/${correlated.id}`}
                      className="flex items-start gap-3 p-3 border border-border hover:bg-muted/50 transition-colors"
                    >
                      <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                        {correlated.sourceType}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {correlated.title}
                        </p>
                        <Metadata>
                          {correlated.sharedThemeCount} shared theme{correlated.sharedThemeCount !== 1 ? "s" : ""}
                        </Metadata>
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
