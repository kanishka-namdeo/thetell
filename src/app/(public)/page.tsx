import { Suspense } from "react";
import { SkeletonFeed } from "@/components/loading/skeleton-feed";
import { FeedPageContent } from "./_components/feed-page-content";

export const dynamic = "force-dynamic";

interface PublicFeedPageProps {
  searchParams: Promise<{ cursor?: string; sourceType?: string; highConsensus?: string }>;
}

export default async function PublicFeedPage({ searchParams }: PublicFeedPageProps) {
  const { cursor, sourceType, highConsensus } = await searchParams;

  return (
    <Suspense fallback={<SkeletonFeed />}>
      <FeedPageContent cursor={cursor} sourceType={sourceType} highConsensus={highConsensus === "true"} />
    </Suspense>
  );
}
