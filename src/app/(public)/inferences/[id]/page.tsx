import { Suspense } from "react";
import { SkeletonDetail } from "@/components/loading/skeleton-detail";
import { InferenceDetailContent } from "./inference-detail-content";

export const dynamic = "force-dynamic";

interface InferencePageProps {
  params: Promise<{ id: string }>;
}

export default async function InferencePage({ params }: InferencePageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<SkeletonDetail />}>
      <InferenceDetailContent id={id} />
    </Suspense>
  );
}
