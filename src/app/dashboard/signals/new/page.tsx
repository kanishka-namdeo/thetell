import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { AddSignalForm } from "@/components/dashboard/add-signal-form";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewSignalPage() {
  const companies = await prisma.company.findMany({
    include: {
      _count: {
        select: { signals: true, articles: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const serializedCompanies = companies.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/signals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Signals
          </Button>
        </Link>
      </div>

      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Intelligence
        </p>
        <h1 className="text-3xl font-serif font-bold">Add Signal</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Submit a new public signal for AI analysis
        </p>
      </div>

      <div className="max-w-2xl">
        <AddSignalForm companies={serializedCompanies} />
      </div>
    </div>
  );
}
