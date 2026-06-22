import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { redirect } from "next/navigation";
import { ThemesClient } from "../themes-client";
import { AdminPageSkeleton } from "@/components/admin/states";

export const dynamic = "force-dynamic";

export default function ThemesPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ThemesContent />
    </Suspense>
  );
}

async function ThemesContent() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  const themes = await prisma.signalTheme.findMany({
    include: {
      company: { select: { id: true, name: true, ticker: true } },
      _count: { select: { signals: true, inferences: true } },
    },
    orderBy: { lastUpdated: "desc" },
    take: 50,
  });

  return <ThemesClient initialThemes={themes} />;
}
