import { Suspense } from "react";
import { SkeletonFeed } from "@/components/loading/skeleton-feed";
import { FeedPageContent } from "./_components/feed-page-content";

export const dynamic = "force-dynamic";

interface PublicFeedPageProps {
  searchParams: Promise<{ cursor?: string; view?: string; sourceType?: string; highConsensus?: string }>;
}

export default async function PublicFeedPage({ searchParams }: PublicFeedPageProps) {
  const { cursor, view, sourceType, highConsensus } = await searchParams;

  return (
    <Suspense fallback={<SkeletonFeed />}>
      <FeedPageContent cursor={cursor} view={view} sourceType={sourceType} highConsensus={highConsensus === "true"} />
    </Suspense>
  );
}
