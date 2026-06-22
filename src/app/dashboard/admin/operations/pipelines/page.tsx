import { PipelinesClient } from "./pipelines-client";

export const dynamic = "force-dynamic";

export default function OperationsPipelinesPage() {
  return (
    <div className="space-y-6">
      <PipelinesClient />
    </div>
  );
}
