import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { redirect } from "next/navigation";
import { InferencesClient } from "../inferences-client";
import { AdminPageSkeleton } from "@/components/admin/states";

export const dynamic = "force-dynamic";

export default function InferencesPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <InferencesContent />
    </Suspense>
  );
}

async function InferencesContent() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  const inferences = await prisma.inference.findMany({
    include: {
      company: { select: { id: true, name: true, ticker: true } },
      theme: { select: { id: true, label: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <InferencesClient initialInferences={inferences} />;
}
