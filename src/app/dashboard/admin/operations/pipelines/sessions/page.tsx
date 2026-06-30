import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PipelineSessionsPage() {
  redirect("/dashboard/admin/operations/pipelines?tab=sessions");
}
