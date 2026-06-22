import { SystemHealthClient } from "./system-health-client";

export const dynamic = "force-dynamic";

export default function OperationsHealthPage() {
  return (
    <div className="space-y-6">
      <SystemHealthClient />
    </div>
  );
}
