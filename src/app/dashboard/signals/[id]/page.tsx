import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { SignalStatusMonitor } from "@/components/dashboard/signal-status-monitor";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageSquare, Handshake, Swords, Lightbulb, ArrowUp, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Type guards for agent-specific data shapes
function isAnalystFact(fact: unknown): fact is {
  text: string;
  category: string;
  confidence: number;
  sourceSentence?: string;
} {
  return typeof fact === "object" && fact !== null && "category" in fact;
}

function isGossipFact(fact: unknown): fact is {
  text: string;
  tell_type: string;
  tell_strength: number;
  subtext: string;
  source_sentence: string;
} {
  return typeof fact === "object" && fact !== null && "tell_type" in fact;
}

function isAnalystTheme(theme: unknown): theme is {
  label: string;
  evidence: string[];
  correlationHints?: string[];
} {
  return typeof theme === "object" && theme !== null && "correlationHints" in theme;
}

function isGossipTheme(theme: unknown): theme is {
  label: string;
  evidence: string[];
  narrativeHook: string;
} {
  return typeof theme === "object" && theme !== null && "narrativeHook" in theme;
}

const sourceTypeLabels: Record<string, string> = {
  NEWS: "News",
  FILING: "Filing",
  TRANSCRIPT: "Transcript",
  SOCIAL: "Social",
  BLOG: "Blog",
  JOB_POSTING: "Job Posting",
};

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

interface SignalDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SignalDetailPage({ params }: SignalDetailPageProps) {
  const { id } = await params;

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

  if (!signal) {
    notFound();
  }

  const analystAnalysis = signal.analyses.find(
    (a) => a.agentPersona === "ANALYST"
  );

  const initialAnalysis = analystAnalysis
    ? {
        id: analystAnalysis.id,
        signalId: analystAnalysis.signalId,
        summary: analystAnalysis.summary,
        keyFacts: (analystAnalysis.keyFacts as Array<{
          text: string;
          category: string;
          confidence: number;
          sourceSentence?: string;
        }>) ?? [],
        sentiment: analystAnalysis.sentiment,
        strategicThemes: (analystAnalysis.strategicThemes as Array<{
          label: string;
          evidence: string[];
          correlationHints?: string[];
        }>) ?? [],
        confidence: analystAnalysis.confidence,
        modelUsed: analystAnalysis.modelUsed,
        analyzedAt: analystAnalysis.analyzedAt.toISOString(),
      }
    : signal.analyses.length > 0
      ? {
          id: signal.analyses[0].id,
          signalId: signal.analyses[0].signalId,
          summary: signal.analyses[0].summary,
          keyFacts: (signal.analyses[0].keyFacts as Array<{
            text: string;
            category: string;
            confidence: number;
            sourceSentence?: string;
          }>) ?? [],
          sentiment: signal.analyses[0].sentiment,
          strategicThemes: (signal.analyses[0].strategicThemes as Array<{
            label: string;
            evidence: string[];
            correlationHints?: string[];
          }>) ?? [],
          confidence: signal.analyses[0].confidence,
          modelUsed: signal.analyses[0].modelUsed,
          analyzedAt: signal.analyses[0].analyzedAt.toISOString(),
        }
      : null;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard/signals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Signals
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline">
            {sourceTypeLabels[signal.sourceType] || signal.sourceType}
          </Badge>
          <Badge
            variant={
              signal.status === "ANALYZED"
                ? "default"
                : signal.status === "FAILED"
                ? "destructive"
                : "outline"
            }
          >
            {signal.status}
          </Badge>
          {analystAnalysis?.sentiment && (
            <SentimentIndicator
              sentiment={analystAnalysis.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
              strength={
                (analystAnalysis.sentimentData as { strength?: "STRONGLY" | "MILDY" } | null)?.strength
              }
            />
          )}
          {signal.analyses.length > 0 && (
            <ConfidenceBadge confidence={Math.max(...signal.analyses.map((a) => a.confidence))} />
          )}
        </div>
        <h1 className="text-2xl lg:text-3xl font-serif font-bold">{signal.title}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-mono text-muted-foreground">
          <Link href={`/dashboard/companies/${signal.company.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              {signal.company.name}
              {signal.company.ticker && ` (${signal.company.ticker})`}
            </Badge>
          </Link>
          <span>
            Scraped:{" "}
            {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          {signal.publishedAt && (
            <span>
              Published:{" "}
              {new Date(signal.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Source URL */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Source
              </p>
              <p className="text-sm font-mono break-all">{signal.sourceUrl}</p>
            </div>
            <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3 w-3 mr-1" />
                Open
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Raw Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Raw Content</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-body leading-relaxed whitespace-pre-wrap">
            {signal.rawContent}
          </p>
        </CardContent>
      </Card>

      {/* Social Signal Metadata */}
      {signal.sourceType === "SOCIAL" && (signal.engagement || signal.metadata || signal.author) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Social Signal Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {signal.author && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{signal.author}</span>
              </div>
            )}
            {(() => {
              const meta = signal.metadata as Record<string, string> | null;
              const eng = signal.engagement as {
                score?: number | null;
                comments?: number | null;
                upvoteRatio?: number | null;
                likes?: number | null;
                retweets?: number | null;
                replies?: number | null;
              } | null;
              return (
                <>
                  {meta?.subreddit && (
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">r/{meta.subreddit}</span>
                    </div>
                  )}
                  {eng && (
                    <div className="grid grid-cols-3 gap-4">
                      {(eng.score ?? eng.likes) != null && (
                        <div className="flex flex-col items-center gap-1">
                          <ArrowUp className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm font-semibold">{eng.score ?? eng.likes}</span>
                          <span className="text-xs text-muted-foreground">Upvotes</span>
                        </div>
                      )}
                      {(eng.comments ?? eng.replies) != null && (
                        <div className="flex flex-col items-center gap-1">
                          <MessageSquare className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm font-semibold">{eng.comments ?? eng.replies}</span>
                          <span className="text-xs text-muted-foreground">Comments</span>
                        </div>
                      )}
                      {(meta?.upvoteRatio ?? eng.upvoteRatio) != null && (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-semibold">
                            {Math.round(parseFloat(String(meta?.upvoteRatio ?? eng.upvoteRatio)) * 100)}%
                          </span>
                          <span className="text-xs text-muted-foreground">Upvote Ratio</span>
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

      <Separator />

      {/* Agent Analyses — side-by-side */}
      {signal.analyses.length > 0 && (
        <>
          <div
            className={cn(
              signal.analyses.length === 1 ? "" : "grid grid-cols-1 md:grid-cols-2 gap-6"
            )}
          >
            {signal.analyses.map((analysis) => {
              const isAnalyst = analysis.agentPersona === "ANALYST";
              const isGossip = analysis.agentPersona === "GOSSIP_GIRL";

              return (
                <Card
                  key={analysis.id}
                  className={cn(
                    "border-2 border-foreground mb-6",
                    isAnalyst && "border-l-4 border-l-primary",
                    isGossip && "border-l-4 border-l-accent"
                  )}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <Badge variant={isAnalyst ? "default" : "accent"}>
                        {isAnalyst ? "The Analyst" : "Gossip Girl"}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {isGossip ? (
                          <ConfidenceBand
                            confidence={analysis.confidence}
                            label="Tell Strength"
                          />
                        ) : (
                          <ConfidenceBadge confidence={analysis.confidence} />
                        )}
                        {isAnalyst && analysis.sentiment && (
                          <SentimentIndicator
                            sentiment={
                              analysis.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"
                            }
                            strength={
                              (analysis.sentimentData as { strength?: "STRONGLY" | "MILDY" } | null)?.strength
                            }
                          />
                        )}
                        {isGossip &&
                          (analysis.sentiment as unknown as { surface_reading?: string })
                            ?.surface_reading && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {surfaceReadingLabels[
                                (analysis.sentiment as unknown as { surface_reading: string })
                                  .surface_reading
                              ] ||
                                (analysis.sentiment as unknown as { surface_reading: string })
                                  .surface_reading}
                            </Badge>
                          )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Summary / The Real Story */}
                    {analysis.summary && (
                      <div>
                        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                          {isAnalyst ? "Summary" : "The Real Story"}
                        </p>
                        <p className="text-sm font-body leading-relaxed">{analysis.summary}</p>
                      </div>
                    )}

                    {/* Key Facts / The Tells */}
                    {analysis.keyFacts &&
                      Array.isArray(analysis.keyFacts) &&
                      analysis.keyFacts.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                            {isAnalyst ? "Key Facts" : "The Tells"}
                          </p>
                          <ul className="space-y-2">
                            {analysis.keyFacts.map((fact, idx) => (
                              <li
                                key={idx}
                                className={cn(
                                  "border-l-2 pl-3",
                                  isAnalyst ? "border-foreground" : "border-accent"
                                )}
                              >
                                <div className="text-sm font-body">
                                  {isAnalystFact(fact) ? (
                                    <>
                                      <span>{fact.text}</span>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-[11px]">
                                          {categoryLabels[fact.category] || fact.category}
                                        </Badge>
                                      </div>
                                    </>
                                  ) : isGossipFact(fact) ? (
                                    <>
                                      <span>{fact.text}</span>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="tell" className="text-[11px]">
                                          {tellTypeLabels[fact.tell_type] || fact.tell_type}
                                        </Badge>
                                      </div>
                                      {fact.subtext && (
                                        <p className="text-xs text-muted-foreground italic mt-1">
                                          {fact.subtext}
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <span>
                                      {typeof fact === "object" && fact !== null && "text" in fact
                                        ? (fact as { text: string }).text
                                        : String(fact)}
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {/* Strategic Themes / The Drama */}
                    {analysis.strategicThemes &&
                      Array.isArray(analysis.strategicThemes) &&
                      analysis.strategicThemes.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                            {isAnalyst ? "Strategic Themes" : "The Drama"}
                          </p>
                          <div className="space-y-3">
                            {analysis.strategicThemes.map((theme, idx) => (
                              <div key={idx} className="border border-foreground p-3">
                                <Badge
                                  variant={isAnalyst ? "outline" : "theme"}
                                  className="mb-2"
                                >
                                  {isGossipTheme(theme)
                                    ? theme.label
                                    : isAnalystTheme(theme)
                                      ? theme.label
                                      : typeof theme === "object" && theme !== null && "label" in theme
                                        ? (theme as { label: string }).label
                                        : String(theme)}
                                </Badge>
                                {isAnalystTheme(theme) &&
                                  theme.correlationHints &&
                                  theme.correlationHints.length > 0 && (
                                    <div className="space-y-1 mt-2">
                                      {theme.correlationHints.map((hint, j) => (
                                        <p
                                          key={j}
                                          className="text-xs font-mono text-muted-foreground"
                                        >
                                          → {hint}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                {isGossipTheme(theme) && theme.narrativeHook && (
                                  <p className="text-xs text-muted-foreground italic mt-2">
                                    {theme.narrativeHook}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Debate Section */}
          {(() => {
            const debate = signal.debates[0];
            if (!debate) {
              return (
                <Card className="mb-6 border-dashed border-2">
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
                        Agent Debate coming soon
                      </p>
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
                  <h2 className="text-2xl font-serif font-bold">Agent Debate</h2>
                </div>

                {/* Side-by-side positions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Analyst Position */}
                  <Card className="border-l-4 border-l-primary">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <Badge variant="default">The Analyst</Badge>
                        <ConfidenceBand confidence={analystPos.confidence} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                          Position
                        </p>
                        <p className="text-sm font-body leading-relaxed">{analystPos.claim}</p>
                      </div>
                      {analystPos.evidence.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                            Evidence
                          </p>
                          <ul className="space-y-1">
                            {analystPos.evidence.map((ev, idx) => (
                              <li key={idx} className="text-sm border-l-2 border-primary pl-3">
                                {ev}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Gossip Girl Position */}
                  <Card className="border-l-4 border-l-accent">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <Badge variant="accent">Gossip Girl</Badge>
                        <ConfidenceBand confidence={gossipPos.tellStrength} label="Tell Strength" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                          The Take
                        </p>
                        <p className="text-sm font-body leading-relaxed">{gossipPos.claim}</p>
                      </div>
                      {gossipPos.evidence.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-2">
                            The Tells
                          </p>
                          <ul className="space-y-1">
                            {gossipPos.evidence.map((ev, idx) => (
                              <li key={idx} className="text-sm border-l-2 border-accent pl-3">
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
                          <p className="text-[11px] uppercase tracking-widest font-sans font-semibold">
                            {contention.topic}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border-l-2 border-primary pl-3">
                              <Badge variant="default" className="mb-1 text-[10px]">Analyst</Badge>
                              <p className="text-sm">{contention.analystView}</p>
                            </div>
                            <div className="border-l-2 border-accent pl-3">
                              <Badge variant="accent" className="mb-1 text-[10px]">Gossip Girl</Badge>
                              <p className="text-sm">{contention.gossipGirlView}</p>
                            </div>
                          </div>
                          {contention.evidence.length > 0 && (
                            <div>
                              <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
                                Evidence
                              </p>
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
                      <p className="text-sm font-body leading-relaxed">{debate.synthesis}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </>
      )}

      <Separator />

      {/* Real-time status monitor and analysis */}
      <SignalStatusMonitor
        signalId={signal.id}
        initialStatus={signal.status}
        initialAnalysis={initialAnalysis}
      />
    </div>
  );
}
