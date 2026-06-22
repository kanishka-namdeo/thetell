import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { Settings } from "lucide-react";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
            Admin
          </p>
        </div>
        <h1 className="text-3xl font-serif font-bold">System Configuration</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Configure discovery, AI models, thresholds, and system settings
        </p>
      </div>

      <SettingsClient />
    </div>
  );
}
