import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MetricsClient } from "./metrics-client";
import { Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminMetricsPage() {
  const session = await auth();

  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Pipeline Metrics"
        description="Monitor signal processing pipeline health and performance"
        actions={
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Live
            </span>
          </div>
        }
      />

      <MetricsClient />
    </div>
  );
}
