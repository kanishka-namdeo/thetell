import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { BarChart3 } from "lucide-react";
import { AnalyticsClient } from "./analytics-client";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
            Admin
          </p>
        </div>
        <h1 className="text-3xl font-serif font-bold">Platform Analytics</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Platform-wide metrics, scraper performance, and AI insights
        </p>
      </div>

      <AnalyticsClient />
    </div>
  );
}
