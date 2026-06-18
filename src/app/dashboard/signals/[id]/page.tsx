import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { SignalStatusMonitor } from "@/components/dashboard/signal-status-monitor";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

interface SignalDetailPageProps {
  params: { id: string };
}

const sourceTypeLabels: Record<string, string> = {
  NEWS: "News",
  FILING: "Filing",
  TRANSCRIPT: "Transcript",
  SOCIAL: "Social",
  BLOG: "Blog",
  JOB_POSTING: "Job Posting",
};

export default async function SignalDetailPage({ params }: SignalDetailPageProps) {
  const signal = await prisma.signal.findUnique({
    where: { id: params.id },
    include: {
      company: true,
      analyses: true,
    },
  });

  if (!signal) {
    notFound();
  }

  const initialAnalysis = signal.analyses && signal.analyses.length > 0
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
          {signal.analyses && signal.analyses.length > 0 && (
            <>
              <SentimentIndicator sentiment={signal.analyses[0].sentiment} />
              <ConfidenceBadge confidence={signal.analyses[0].confidence} />
            </>
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
              <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
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
