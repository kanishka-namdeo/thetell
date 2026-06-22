import { Suspense } from "react";
import { SkeletonDetail } from "@/components/loading/skeleton-detail";
import { SignalDetailContent } from "./signal-detail-content";

export const dynamic = "force-dynamic";

interface SignalDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SignalDetailPage({
  params,
}: SignalDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<SkeletonDetail />}>
      <SignalDetailContent id={id} />
    </Suspense>
  );
}
