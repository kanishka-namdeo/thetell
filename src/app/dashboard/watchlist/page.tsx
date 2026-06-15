import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bookmark } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const session = await auth();
  
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const watchedCompanies = await prisma.watchedCompany.findMany({
    where: { userId: session.user.id },
    include: {
      company: {
        include: {
          _count: {
            select: {
              signals: true,
              articles: true,
            },
          },
          signals: {
            take: 5,
            orderBy: { scrapedAt: "desc" },
            include: {
              analysis: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Tracking
        </p>
        <h1 className="text-3xl font-serif font-bold">Watchlist</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Companies you&apos;re monitoring for strategic signals
        </p>
      </div>

      {watchedCompanies.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground mb-2">
              No companies watched
            </p>
            <p className="text-sm text-muted-foreground font-body mb-4">
              Start tracking companies to see their signals here
            </p>
            <Link href="/dashboard/companies">
              <Button variant="outline">Browse Companies</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-xs font-mono text-muted-foreground">
            {watchedCompanies.length} compan{watchedCompanies.length !== 1 ? "ies" : "y"} watched
          </p>

          {watchedCompanies.map((watched) => (
            <Card key={watched.id} className="hard-shadow-hover transition-all">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{watched.company.name}</CardTitle>
                    {watched.company.ticker && (
                      <Badge variant="outline" className="mt-1 font-mono">
                        {watched.company.ticker}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                    <span>{watched.company._count.signals} signals</span>
                    <span>{watched.company._count.articles} articles</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {watched.company.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 font-body mb-4">
                    {watched.company.description}
                  </p>
                )}

                {watched.company.signals.length > 0 && (
                  <div>
                    <h3 className="text-sm font-serif font-semibold mb-2">Recent Signals</h3>
                    <div className="space-y-2">
                      {watched.company.signals.map((signal) => (
                        <div key={signal.id} className="border-l-2 border-foreground pl-3">
                          <Link
                            href={`/dashboard/signals/${signal.id}`}
                            className="text-sm font-serif font-medium hover:underline"
                          >
                            {signal.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            {signal.analysis && (
                              <Badge variant="outline" className="text-[9px]">
                                {Math.round(signal.analysis.confidence * 100)}% confidence
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Link href={`/dashboard/companies/${watched.company.id}`}>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/dashboard/signals?companyId=${watched.company.id}`}>
                    <Button variant="ghost" size="sm">
                      View All Signals
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
