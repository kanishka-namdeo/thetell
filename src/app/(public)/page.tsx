import { Suspense } from "react";
import { SkeletonFeed } from "@/components/loading/skeleton-feed";
import { FeedPageContent } from "./_components/feed-page-content";

export const dynamic = "force-dynamic";

interface PublicFeedPageProps {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function PublicFeedPage({ searchParams }: PublicFeedPageProps) {
  const { cursor } = await searchParams;

  return (
    <Suspense fallback={<SkeletonFeed />}>
      <FeedPageContent cursor={cursor} />
    </Suspense>
  );
}
