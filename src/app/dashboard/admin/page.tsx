import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { redirect } from "next/navigation";
import { AdminDashboardTabs } from "@/components/admin/admin-dashboard-tabs";
import type { AdminOverviewData } from "@/components/admin/admin-overview-tab";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  const [
    totalUsers,
    totalSignals,
    totalCompanies,
    usersToday,
    recentAuditLogs,
    activeThemes,
    confirmedHypotheses,
    failedPipelineRuns,
    runningPipelineRuns,
    recentAnalyses,
    themeStatusCounts,
    activeClusterCount,
    activeUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.signal.count(),
    prisma.company.count(),
    prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    }),
    prisma.signalTheme.count({
      where: {
        status: { in: ["EMERGING", "ACCELERATING"] },
      },
    }),
    prisma.companyHypothesis.count({
      where: { status: "CONFIRMED" },
    }),
    prisma.pipelineRun.count({
      where: { status: "failed" },
    }),
    prisma.pipelineRun.count({
      where: { status: "running" },
    }),
    prisma.analysis.findMany({
      take: 5,
      orderBy: { analyzedAt: "desc" },
      include: {
        signal: {
          include: {
            company: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    }),
    prisma.signalTheme.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.signalTheme.count({
      where: { status: { in: ["EMERGING", "ACCELERATING"] } },
    }),
    prisma.user.count({
      where: { status: "ACTIVE" },
    }),
  ]);

  const themeStatusMap: Record<string, number> = {
    EMERGING: 0,
    ACCELERATING: 0,
    PEAKED: 0,
    FADING: 0,
    RESOLVED: 0,
  };

  for (const item of themeStatusCounts) {
    themeStatusMap[item.status] = item._count;
  }

  const overviewData: AdminOverviewData = {
    totalUsers,
    totalSignals,
    totalCompanies,
    usersToday,
    activeUsers,
    activeThemes,
    confirmedHypotheses,
    failedPipelineRuns,
    runningPipelineRuns,
    activeClusterCount,
    recentAnalyses: recentAnalyses.map((analysis) => ({
      id: analysis.id,
      title: analysis.signal?.title ?? "Unknown",
      confidence: analysis.confidence,
      sentiment: analysis.sentiment,
      createdAt: analysis.analyzedAt,
      company: analysis.signal?.company,
    })),
    themeStatusMap,
    recentAuditLogs: recentAuditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      createdAt: log.createdAt,
      user: log.user,
    })),
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of platform activity and system health
        </p>
      </div>

      <AdminDashboardTabs overviewData={overviewData} />
    </div>
  );
}
