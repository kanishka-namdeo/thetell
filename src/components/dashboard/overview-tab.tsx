import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DataFlowDiagram } from "@/components/dashboard/data-flow-diagram";
import Link from "next/link";
import {
  Lightbulb,
  ArrowRight,
  Layers,
} from "lucide-react";

export interface OverviewData {
  signalCount: number;
  companyCount: number;
  avgConfidence: number;
  activeClusterCount: number;
  sentimentCounts: Array<{
    sentiment: string;
    _count: number;
  }>;
  topInsights: Array<{
    id: string;
    signalId: string;
    confidence: number;
    sentiment: string;
    sentimentData: unknown;
    signal: {
      title: string;
      company: {
        name: string;
      };
    };
  }>;
  recentSignals: Array<{
    id: string;
    title: string;
    scrapedAt: Date;
    company: {
      name: string;
    };
    analyses: Array<{
      confidence: number;
    }>;
  }>;
}

interface OverviewTabProps {
  data: OverviewData;
}

export function OverviewTab({ data }: OverviewTabProps) {
  const {
    signalCount,
    companyCount,
    avgConfidence,
    sentimentCounts,
    topInsights,
    recentSignals,
  } = data;

  return (
    <div className="space-y-6">
      {/* Data Flow Diagram */}
      <DataFlowDiagram />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Signals"
          value={signalCount}
          description="Public signals tracked"
          icon="BarChart3"
        />
        <StatCard
          title="Companies"
          value={companyCount}
          description="Organizations monitored"
          icon="Building2"
        />
        <StatCard
          title="Active Clusters"
          value={data.activeClusterCount}
          description="Emerging + Accelerating"
          icon="Layers"
        />
        <StatCard
          title="Avg Confidence"
          value={`${Math.round(avgConfidence * 100)}%`}
          description="Analysis reliability"
          icon="TrendingUp"
        />
      </div>

      {/* Sentiment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sentimentCounts.map((sc) => (
          <Card key={sc.sentiment}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
                    {sc.sentiment} Signals
                  </p>
                  <p className="text-2xl font-serif font-bold mt-1">{sc._count}</p>
                </div>
                <SentimentIndicator
                  sentiment={sc.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                  showLabel={false}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts with Date Range Filter */}
      <DashboardCharts />

      {/* Top Insights */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Top Insights
            </CardTitle>
            <p className="text-xs font-sans text-muted-foreground">
              Highest confidence analyses
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topInsights.map((insight) => (
              <div key={insight.id} className="border-l-2 border-foreground pl-3">
                <Link
                  href={`/dashboard/signals/${insight.signalId}`}
                  className="text-sm font-serif font-medium hover:underline"
                >
                  {insight.signal.title}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[11px]">
                    {insight.signal.company.name}
                  </Badge>
                  <ConfidenceBadge confidence={insight.confidence} className="text-[11px]" />
                  <SentimentIndicator
                    sentiment={insight.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                    strength={
                      (insight.sentimentData as { strength?: "STRONGLY" | "MILDY" } | null)?.strength
                    }
                    className="text-[11px]"
                  />
                </div>
              </div>
            ))}
            {topInsights.length === 0 && (
              <p className="text-sm text-muted-foreground font-body">
                No analyses available yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Signals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Signals</CardTitle>
            <Link href="/dashboard/signals">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentSignals.map((signal) => (
              <div key={signal.id} className="border-l-2 border-foreground pl-3">
                <Link
                  href={`/dashboard/signals/${signal.id}`}
                  className="text-sm font-serif font-medium hover:underline"
                >
                  {signal.title}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[11px]">
                    {signal.company.name}
                  </Badge>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {signal.analyses[0] && (
                    <ConfidenceBadge
                      confidence={signal.analyses[0].confidence}
                      className="text-[11px]"
                    />
                  )}
                </div>
              </div>
            ))}
            {recentSignals.length === 0 && (
              <p className="text-sm text-muted-foreground font-body">
                No signals available yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}