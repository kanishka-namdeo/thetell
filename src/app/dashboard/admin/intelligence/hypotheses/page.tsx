import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { redirect } from "next/navigation";
import { HypothesesClient } from "../hypotheses-client";

export const dynamic = "force-dynamic";

export default async function HypothesesPage() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  const [hypotheses, companies] = await Promise.all([
    prisma.companyHypothesis.findMany({
      include: {
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [{ status: "asc" }, { confidence: "desc" }, { createdAt: "desc" }],
    }),
    prisma.company.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = hypotheses.map((h) => ({
    ...h,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    evidence: (Array.isArray(h.evidence) ? h.evidence : []) as unknown[],
  }));

  return <HypothesesClient initialHypotheses={serialized} companies={companies} />;
}
