import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-guard";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ControlCenterClient } from "@/components/admin/control-center/ControlCenterClient";

export default async function ControlCenterPage() {
  const session = await auth();

  if (!session || !isAdmin(session)) {
    redirect("/dashboard");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Control Center"
        description="Monitor and trigger the signal processing pipeline"
      />

      <ControlCenterClient />
    </div>
  );
}
