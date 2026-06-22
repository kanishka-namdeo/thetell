import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container, Section } from "@/components/layout";

/**
 * Signal/article detail page skeleton.
 * Matches the single-column (max-w-4xl) detail layout with
 * hero header, content card, and dual analysis cards.
 */
export function SkeletonDetail() {
  return (
    <Section>
      <Container className="max-w-4xl">
        {/* Back Link Skeleton */}
        <Skeleton className="h-4 w-24 mb-6 rounded-none" />

        {/* Signal Header Skeleton */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <Skeleton className="h-5 w-28 mb-3 rounded-none" />
          <Skeleton className="h-10 w-full mb-2 rounded-none" />
          <Skeleton className="h-10 w-3/4 mb-4 rounded-none" />
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-5 w-16 rounded-none" />
            <Skeleton className="h-3 w-28 rounded-none" />
            <Skeleton className="h-5 w-24 rounded-none" />
            <Skeleton className="h-5 w-20 rounded-none" />
            <Skeleton className="h-8 w-20 ml-auto rounded-none" />
          </div>
        </div>

        {/* Signal Content Skeleton */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-5 w-32 rounded-none" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className={`h-4 rounded-none ${i === 5 ? "w-2/3" : "w-full"}`}
              />
            ))}
          </CardContent>
        </Card>

        {/* Analysis Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card
              key={i}
              className="border-2 border-foreground border-l-4 border-l-foreground/30"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <Skeleton className="h-5 w-20 rounded-none" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-24 rounded-none" />
                    <Skeleton className="h-5 w-16 rounded-none" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary */}
                <div>
                  <Skeleton className="h-3 w-16 mb-2 rounded-none" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full rounded-none" />
                    <Skeleton className="h-4 w-5/6 rounded-none" />
                    <Skeleton className="h-4 w-3/4 rounded-none" />
                  </div>
                </div>

                {/* Key Facts */}
                <div>
                  <Skeleton className="h-3 w-20 mb-2 rounded-none" />
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="border-l-2 border-foreground/20 pl-3 space-y-1">
                        <Skeleton className="h-4 w-full rounded-none" />
                        <Skeleton className="h-3 w-16 rounded-none" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strategic Themes */}
                <div>
                  <Skeleton className="h-3 w-32 mb-2 rounded-none" />
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, j) => (
                      <div key={j} className="border border-foreground/20 p-3 space-y-2">
                        <Skeleton className="h-4 w-28 rounded-none" />
                        <Skeleton className="h-3 w-full rounded-none" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
