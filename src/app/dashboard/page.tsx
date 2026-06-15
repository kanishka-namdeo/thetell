import { prisma } from "@/lib/db";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/dashboard/confidence-badge";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  FileText,
  TrendingUp,
  ArrowRight,
  Lightbulb,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [signalCount, companyCount, articleCount, recentSignals, avgConfidence] =
    await Promise.all([
      prisma.signal.count(),
      prisma.company.count(),
      prisma.article.count(),
      prisma.signal.findMany({
        take: 5,
        orderBy: { scrapedAt: "desc" },
        include: {
          company: true,
          analysis: true,
        },
      }),
      prisma.analysis.aggregate({
        _avg: { confidence: true },
      }),
    ]);

  const recentArticles = await prisma.article.findMany({
    take: 3,
    orderBy: { publishedAt: "desc" },
    include: { company: true },
  });

  const sentimentCounts = await prisma.analysis.groupBy({
    by: ["sentiment"],
    _count: true,
  });

  const topInsights = await prisma.analysis.findMany({
    take: 5,
    orderBy: { confidence: "desc" },
    include: {
      signal: {
        include: {
          company: true,
        },
      },
    },
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Dashboard
        </p>
        <h1 className="text-3xl font-serif font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Corporate intelligence at a glance
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Signals"
          value={signalCount}
          description="Public signals tracked"
          icon={BarChart3}
        />
        <StatCard
          title="Companies"
          value={companyCount}
          description="Organizations monitored"
          icon={Building2}
        />
        <StatCard
          title="Articles"
          value={articleCount}
          description="Intelligence reports"
          icon={FileText}
        />
        <StatCard
          title="Avg Confidence"
          value={`${Math.round((avgConfidence._avg.confidence || 0) * 100)}%`}
          description="Analysis reliability"
          icon={TrendingUp}
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
                  <Badge variant="outline" className="text-[9px]">
                    {insight.signal.company.name}
                  </Badge>
                  <ConfidenceBadge confidence={insight.confidence} className="text-[9px]" />
                  <SentimentIndicator
                    sentiment={insight.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                    className="text-[9px]"
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

      {/* Recent Signals & Articles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <Badge variant="outline" className="text-[9px]">
                      {signal.company.name}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {signal.analysis && (
                      <ConfidenceBadge
                        confidence={signal.analysis.confidence}
                        className="text-[9px]"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Articles */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent Articles</CardTitle>
              <Link href="/dashboard/articles">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentArticles.map((article) => (
                <div key={article.id} className="border-l-2 border-foreground pl-3">
                  <Link
                    href={`/dashboard/articles/${article.id}`}
                    className="text-sm font-serif font-medium hover:underline"
                  >
                    {article.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[9px]">
                      {article.company.name}
                    </Badge>
                    <Badge
                      variant={article.status === "PUBLISHED" ? "default" : "outline"}
                      className="text-[9px]"
                    >
                      {article.status}
                    </Badge>
                    {article.publishedAt && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(article.publishedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {recentArticles.length === 0 && (
                <p className="text-sm text-muted-foreground font-body">
                  No articles published yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
