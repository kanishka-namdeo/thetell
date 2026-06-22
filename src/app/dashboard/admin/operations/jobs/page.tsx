import { JobsClient } from "./jobs-client";

export const dynamic = "force-dynamic";

export default function OperationsJobsPage() {
  return (
    <div className="space-y-6">
      <JobsClient />
    </div>
  );
}
