import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { redirect } from "next/navigation";
import { IntelligenceOverview } from "./intelligence-overview";
import { AdminPageSkeleton } from "@/components/admin/states";

export const dynamic = "force-dynamic";

export default function IntelligencePage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <IntelligenceContent />
    </Suspense>
  );
}

async function IntelligenceContent() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  const [
    lastCorrelationJob,
    totalThemes,
    themeStatusCounts,
    activeInferences,
    confirmedInferences,
    refutedInferences,
    recentInferences,
    calibratedInferences,
    correctCalibrations,
  ] = await Promise.all([
    prisma.job.findFirst({
      where: { type: "correlate-signals" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.signalTheme.count(),
    prisma.signalTheme.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.inference.count({
      where: {
        status: { in: ["EMERGING", "DEVELOPING"] },
      },
    }),
    prisma.inference.count({
      where: { status: "CONFIRMED" },
    }),
    prisma.inference.count({
      where: { status: "REFUTED" },
    }),
    prisma.inference.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    }),
    prisma.inferenceCalibration.count({
      where: { resolvedAt: { not: null } },
    }),
    prisma.inferenceCalibration.count({
      where: { wasCorrect: true },
    }),
  ]);

  const calibrationAccuracy =
    calibratedInferences > 0
      ? (correctCalibrations / calibratedInferences) * 100
      : null;

  const themeStatusMap = {
    EMERGING: 0,
    ACCELERATING: 0,
    PEAKED: 0,
    FADING: 0,
    RESOLVED: 0,
  };

  for (const item of themeStatusCounts) {
    themeStatusMap[item.status as keyof typeof themeStatusMap] = item._count;
  }

  const serializedInferences = recentInferences.map((inf) => ({
    ...inf,
    createdAt: inf.createdAt.toISOString(),
    updatedAt: inf.updatedAt.toISOString(),
  }));

  return (
    <IntelligenceOverview
      lastRunAt={lastCorrelationJob?.completedAt?.toISOString() || null}
      totalThemes={totalThemes}
      themeStatusDistribution={themeStatusMap}
      activeInferences={activeInferences}
      confirmedInferences={confirmedInferences}
      refutedInferences={refutedInferences}
      calibrationAccuracy={calibrationAccuracy}
      recentInferences={serializedInferences}
    />
  );
}
