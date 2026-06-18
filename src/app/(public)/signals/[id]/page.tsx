import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Container, Section, Headline, Body, Badge, Card, CardContent, CardHeader, CardTitle, Metadata } from "@/components";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { SignupPrompt } from "../../_components/signup-prompt";
import { ShareButton } from "@/components/dashboard/share-button";
import { ConsensusBadge, calculateConsensus } from "./consensus-badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

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

  return (
    <Section>
      <Container className="max-w-4xl">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        {/* Signal Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <Link href={`/companies/${signal.company.id}`}>
            <Badge variant="outline" className="mb-3 cursor-pointer hover:bg-accent">
              {signal.company.name}
            </Badge>
          </Link>
          <Headline level={1} size="hero" className="mb-4">
            {signal.title}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{signal.sourceType}</Badge>
            <Metadata>{scrapedDate}</Metadata>
            {signal.analyses.length > 0 && (
              <>
                <ConfidenceBand confidence={Math.max(...signal.analyses.map(a => a.confidence))} />
                <SentimentIndicator
                  sentiment={signal.analyses[0].sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                />
              </>
            )}
            <div className="ml-auto">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Signal Content */}
        {signal.rawContent && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Signal Content</CardTitle>
            </CardHeader>
            <CardContent>
              <Body className="whitespace-pre-wrap">{signal.rawContent}</Body>
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
                <div className="mb-4">
                  <ConsensusBadge consensus={consensus} />
                </div>
              ) : null;
            })()}

            <div className={signal.analyses.length === 1 ? "" : "grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"}>
              {signal.analyses.map((analysis) => (
              <Card
                key={analysis.id}
                className={cn(
                  "border-2 border-foreground mb-6",
                  analysis.agentPersona === "ANALYST" && "border-l-4 border-l-primary",
                  analysis.agentPersona === "GOSSIP_GIRL" && "border-l-4 border-l-accent"
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <Badge
                      variant={analysis.agentPersona === "ANALYST" ? "default" : "accent"}
                    >
                      {analysis.agentPersona === "ANALYST" ? "The Analyst" : "Gossip Girl"}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <ConfidenceBand confidence={analysis.confidence} />
                      <SentimentIndicator
                        sentiment={analysis.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Summary */}
                  {analysis.summary && (
                    <div>
                      <Metadata className="mb-2">Summary</Metadata>
                      <Body>{analysis.summary}</Body>
                    </div>
                  )}

                  {/* Key Facts */}
                  {analysis.keyFacts && Array.isArray(analysis.keyFacts) && analysis.keyFacts.length > 0 && (
                    <div>
                      <Metadata className="mb-2">Key Facts</Metadata>
                      <ul className="space-y-2">
                        {analysis.keyFacts.map((fact, idx) => (
                          <li key={idx} className="border-l-2 border-foreground pl-3">
                            <Body className="text-sm">
                              {typeof fact === "object" && fact !== null && "text" in fact
                                ? (fact as { text: string }).text
                                : String(fact)}
                            </Body>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strategic Themes */}
                  {analysis.strategicThemes && Array.isArray(analysis.strategicThemes) && analysis.strategicThemes.length > 0 && (
                    <div>
                      <Metadata className="mb-2">Strategic Themes</Metadata>
                      <div className="flex flex-wrap gap-2">
                        {analysis.strategicThemes.map((theme, idx) => (
                          <Badge key={idx} variant="outline">
                            {typeof theme === "object" && theme !== null && "label" in theme
                              ? (theme as { label: string }).label
                              : String(theme)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            </div>
          </>
        )}

        {/* Signup Prompt */}
        <SignupPrompt />

        {/* Source Link */}
        {signal.sourceUrl && (
          <div className="mt-6 text-center">
            <Metadata>
              Source:{" "}
              <a
                href={signal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                {signal.sourceUrl}
              </a>
            </Metadata>
          </div>
        )}
      </Container>
    </Section>
  );
}
