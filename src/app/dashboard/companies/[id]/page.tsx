import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SignalTable } from "@/components/dashboard/signal-table";
import { ArticleCard } from "@/components/dashboard/article-card";
import { WatchlistButton } from "@/components/dashboard/watchlist-button";
import { DeleteCompanyButton } from "@/components/dashboard/delete-company-button";
import { PipelineStatusBanner } from "@/components/dashboard/pipeline-status-banner";
import { TrackedSubredditsSection } from "./tracked-subreddits-section";
import { DataSourcesSection } from "./data-sources-section";
import { enrichCompany } from "@/lib/enrichment";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw, Layers } from "lucide-react";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface CompanyDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function reEnrichAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const companyId = formData.get("companyId");
  if (typeof companyId !== "string" || !companyId) {
    throw new Error("Missing companyId");
  }

  try {
    await enrichCompany(companyId);
  } catch (error) {
    logger.error("company.reenrichment_failed", { companyId, error: String(error) });
  }

  redirect(`/dashboard/companies/${companyId}`);
}

export default async function CompanyDetailPage({ params, searchParams }: CompanyDetailPageProps) {
  const session = await auth();
  const { id } = await params;
  const { discovery } = await searchParams;
  const showDiscoveryBanner = discovery === "queued";

  const [company, watchedCompany] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        signals: {
          take: 10,
          orderBy: { scrapedAt: "desc" },
          include: {
            company: true,
            analyses: true,
          },
        },
        articles: {
          take: 5,
          orderBy: { publishedAt: "desc" },
          include: {
            company: true,
            author: {
              select: { name: true, email: true },
            },
          },
        },
        signalThemes: {
          where: {
            status: { in: ["EMERGING", "ACCELERATING"] },
          },
          orderBy: { momentum: "desc" },
          take: 5,
        },
        trackedSubreddits: {
          orderBy: { discoveredAt: "desc" },
        },
        dataSources: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
        },
        enrichmentLogs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        _count: {
          select: { signals: true, articles: true },
        },
      },
    }),
    session?.user?.id
      ? prisma.watchedCompany.findUnique({
          where: {
            userId_companyId: {
              userId: session.user.id,
              companyId: id,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!company) {
    notFound();
  }

  const feeds = company.dataSources.filter(ds =>
    ds.sourceType === "RSS" || ds.sourceType === "BLOG" || ds.sourceType === "NEWS"
  );
  const socials = company.dataSources.filter(ds => ds.sourceType === "SOCIAL");

  const isWatched = !!watchedCompany;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard/companies">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Companies
          </Button>
        </Link>
      </div>

      {/* Pipeline Status Banner */}
      {session?.user?.role === "ADMIN" && (
        <PipelineStatusBanner companyId={company.id} show={showDiscoveryBanner} />
      )}

      {/* Header */}
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold">{company.name}</h1>
            {company.ticker && (
              <Badge variant="outline" className="mt-2 font-mono">
                {company.ticker}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {session?.user && (
              <WatchlistButton
                companyId={company.id}
                isWatched={isWatched}
              />
            )}
            {company.websiteUrl && (
              <a
                href={company.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Website
                </Button>
              </a>
            )}
            <DeleteCompanyButton
              companyId={company.id}
              companyName={company.name}
            />
          </div>
        </div>
        {company.description && (
          <p className="text-sm font-body text-muted-foreground mt-4 leading-relaxed">
            {company.description}
          </p>
        )}
        <div className="flex gap-4 mt-4">
          <div className="border-l-2 border-foreground pl-3">
            <p className="text-2xl font-serif font-bold">{company._count.signals}</p>
            <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
              Signals
            </p>
          </div>
          <div className="border-l-2 border-foreground pl-3">
            <p className="text-2xl font-serif font-bold">{company._count.articles}</p>
            <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
              Articles
            </p>
          </div>
          <div className="border-l-2 border-foreground pl-3">
            <p className="text-2xl font-serif font-bold">{company.signalThemes.length}</p>
            <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
              Clusters
            </p>
          </div>
        </div>
      </div>

      {/* Active Clusters */}
      {company.signalThemes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <CardTitle>Active Clusters</CardTitle>
            </div>
            <CardDescription>
              Signal clusters detected for this company
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {company.signalThemes.map((theme) => (
                <Link
                  key={theme.id}
                  href={`/clusters/${theme.id}`}
                  className="block border-l-2 border-primary pl-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{theme.label}</p>
                      {theme.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {theme.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={theme.status === "ACCELERATING" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {theme.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          Momentum: {theme.momentum.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tracked Subreddits */}
      <TrackedSubredditsSection
        subreddits={company.trackedSubreddits}
        companyId={company.id}
        isAdmin={session?.user?.role === "ADMIN"}
      />

      {/* Data Sources */}
      <DataSourcesSection
        feeds={feeds}
        socials={socials}
        ticker={company.ticker}
        companyId={company.id}
        companyName={company.name}
        isAdmin={session?.user?.role === "ADMIN"}
      />

      {/* Enrichment History */}
      {company.enrichmentLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Enrichment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {company.enrichmentLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(log.createdAt).toLocaleDateString()}</span>
                  <Badge variant={log.status === "success" ? "default" : log.status === "partial" ? "secondary" : "destructive"}>
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cluster Summary */}
      {company.signalThemes.length > 0 && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle>Active Clusters</CardTitle>
            <CardDescription>
              Strategic themes and signal clusters for this company
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {company.signalThemes.map((theme) => (
                <div
                  key={theme.id}
                  className="flex items-start justify-between gap-4 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <Link href={`/clusters/${theme.id}`}>
                      <h4 className="font-medium hover:underline">{theme.label}</h4>
                    </Link>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <Badge variant="secondary">{theme.status}</Badge>
                      <span>Momentum: {theme.momentum.toFixed(2)}</span>
                    </div>
                  </div>
                  <Link href={`/clusters/${theme.id}`}>
                    <Button variant="outline" size="sm">View Cluster</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Recent Signals */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-serif font-bold">Recent Signals</h2>
          <Link href={`/dashboard/signals?companyId=${company.id}`}>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </div>
        {company.signals.length > 0 ? (
          <SignalTable signals={company.signals} />
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground font-body">
                No signals found for this company.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      {/* Recent Articles */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-serif font-bold">Recent Articles</h2>
          <Link href={`/dashboard/articles?companyId=${company.id}`}>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </div>
        {company.articles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {company.articles.map((article) => (
              <ArticleCard
                key={article.id}
                id={article.id}
                title={article.title}
                slug={article.slug}
                summary={article.summary}
                companyName={article.company.name}
                companyTicker={article.company.ticker}
                publishedAt={article.publishedAt ? article.publishedAt.toISOString() : null}
                status={article.status}
                authorName={article.author?.name ?? null}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground font-body">
                No articles published for this company yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
