import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Single feed-card skeleton matching FeedSignalCard dimensions.
 * Newsprint styling: sharp corners, editorial border treatment.
 */
export function SkeletonCard() {
  return (
    <Card className="border border-foreground/10">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-16 rounded-none" />
            <Skeleton className="h-5 w-3/4 rounded-none" />
          </div>
          <Skeleton className="h-3 w-12 rounded-none" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-none" />
          <Skeleton className="h-5 w-14 rounded-none" />
          <Skeleton className="h-5 w-24 rounded-none" />
          <Skeleton className="h-5 w-16 rounded-none" />
        </div>
      </CardContent>
    </Card>
  );
}
