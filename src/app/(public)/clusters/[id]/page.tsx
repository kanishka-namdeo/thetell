import { Suspense } from "react";
import { SkeletonDetail } from "@/components/loading/skeleton-detail";
import { ClusterDetailContent } from "./cluster-detail-content";

export const dynamic = "force-dynamic";

interface ClusterDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClusterDetailPage({
  params,
}: ClusterDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<SkeletonDetail />}>
      <ClusterDetailContent id={id} />
    </Suspense>
  );
}
