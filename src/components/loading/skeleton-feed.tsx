import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container, Section } from "@/components/layout";
import { SkeletonCard } from "./skeleton-card";

/**
 * Full feed page skeleton with hero, signal cards, and sidebar.
 * Matches the 3-column grid layout of the public feed page.
 */
export function SkeletonFeed() {
  return (
    <>
      {/* Hero Inference Skeleton */}
      <Section className="border-b-4 border-foreground">
        <Container>
          <Skeleton className="h-5 w-24 mb-4 rounded-none" />
          <Card className="border-2 border-foreground">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 mb-3">
                <Skeleton className="h-7 w-2/3 rounded-none" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20 rounded-none" />
                  <Skeleton className="h-5 w-24 rounded-none" />
                  <Skeleton className="h-5 w-16 rounded-none" />
                </div>
              </div>
              <Skeleton className="h-5 w-28 rounded-none" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full rounded-none" />
              <Skeleton className="h-4 w-4/5 rounded-none mt-2" />
            </CardContent>
          </Card>
        </Container>
      </Section>

      {/* Main Feed Skeleton */}
      <Section texture>
        <Container>
          <div className="mb-8">
            <Skeleton className="h-3 w-28 mb-2 rounded-none" />
            <Skeleton className="h-8 w-48 rounded-none" />
            <Skeleton className="h-3 w-32 mt-2 rounded-none" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Signal Cards */}
            <div className="lg:col-span-2 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>

            {/* Sidebar Skeleton */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Skeleton className="h-5 w-32 rounded-none" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-full rounded-none" />
                        <Skeleton className="h-3 w-2/3 rounded-none" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Skeleton className="h-5 w-36 rounded-none" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="border-l-2 border-foreground/20 pl-3 space-y-2">
                        <Skeleton className="h-4 w-full rounded-none" />
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-16 rounded-none" />
                          <Skeleton className="h-3 w-12 rounded-none" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
