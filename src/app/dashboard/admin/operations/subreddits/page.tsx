import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { MessageCircle } from "lucide-react";
import { SubredditsClient } from "./subreddits-client";

export const dynamic = "force-dynamic";

export default async function AdminSubredditsPage() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, ticker: true, industry: true, sector: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
            Admin
          </p>
        </div>
        <h1 className="text-3xl font-serif font-bold">Subreddit Management</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Manage tracked subreddits per company and monitor validation
        </p>
      </div>

      <SubredditsClient companies={companies} />
    </div>
  );
}
