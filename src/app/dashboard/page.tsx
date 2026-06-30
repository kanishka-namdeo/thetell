import { prisma } from "@/lib/db";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import type { OverviewData } from "@/components/dashboard/overview-tab";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    signalCount,
    companyCount,
    articleCount,
    recentSignals,
    avgConfidence,
    activeClusterCount,
    recentArticles,
    sentimentCounts,
    topInsights,
  ] = await Promise.all([
    prisma.signal.count(),
    prisma.company.count(),
    prisma.article.count(),
    prisma.signal.findMany({
      take: 5,
      orderBy: { scrapedAt: "desc" },
      include: {
        company: true,
        analyses: true,
      },
    }),
    prisma.analysis.aggregate({
      _avg: { confidence: true },
    }),
    prisma.signalTheme.count({
      where: { status: { in: ["EMERGING", "ACCELERATING"] } },
    }),
    prisma.article.findMany({
      take: 3,
      orderBy: { publishedAt: "desc" },
      include: { company: true },
    }),
    prisma.analysis.groupBy({
      by: ["sentiment"],
      _count: true,
    }),
    prisma.analysis.findMany({
      take: 5,
      orderBy: { confidence: "desc" },
      include: {
        signal: {
          include: {
            company: true,
          },
        },
      },
    }),
  ]);

  const overviewData: OverviewData = {
    signalCount,
    companyCount,
    articleCount,
    avgConfidence: avgConfidence._avg.confidence || 0,
    activeClusterCount,
    sentimentCounts,
    topInsights: topInsights.map((t) => ({
      id: t.id,
      signalId: t.signalId,
      confidence: t.confidence,
      sentiment: t.sentiment,
      sentimentData: t.sentimentData,
      signal: {
        title: t.signal.title,
        company: { name: t.signal.company.name },
      },
    })),
    recentSignals: recentSignals.map((s) => ({
      id: s.id,
      title: s.title,
      scrapedAt: s.scrapedAt,
      company: { name: s.company.name },
      analyses: s.analyses.map((a) => ({ confidence: a.confidence })),
    })),
    recentArticles: recentArticles.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      publishedAt: a.publishedAt,
      company: { name: a.company.name },
    })),
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Dashboard
        </p>
        <h1 className="text-3xl font-serif font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Corporate intelligence at a glance
        </p>
      </div>

      <DashboardTabs overviewData={overviewData} />
    </div>
  );
}
