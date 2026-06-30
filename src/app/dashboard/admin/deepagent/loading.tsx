import { Skeleton } from "@/components/ui/skeleton";

export default function DeepAgentLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
