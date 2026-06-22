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
import { TrackedSubredditsSection } from "./tracked-subreddits-section";
import { enrichCompany } from "@/lib/enrichment";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

interface CompanyDetailPageProps {
  params: Promise<{ id: string }>;
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
    console.error("Re-enrichment failed:", error);
  }

  redirect(`/dashboard/companies/${companyId}`);
}

export default async function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const session = await auth();
  const { id } = await params;

  const company = await prisma.company.findUnique({
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
  });

  if (!company) {
    notFound();
  }

  const feeds = company.dataSources.filter(ds =>
    ds.sourceType === "RSS" || ds.sourceType === "BLOG" || ds.sourceType === "NEWS"
  );
  const socials = company.dataSources.filter(ds => ds.sourceType === "SOCIAL");

  const isWatched = session?.user?.id
    ? await prisma.watchedCompany.findUnique({
        where: {
          userId_companyId: {
            userId: session.user.id,
            companyId: company.id,
          },
        },
      }).then(w => !!w)
    : false;

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
        </div>
      </div>

      {/* Tracked Subreddits */}
      <TrackedSubredditsSection
        subreddits={company.trackedSubreddits}
        companyId={company.id}
        isAdmin={session?.user?.role === "ADMIN"}
      />

      {/* Data Sources */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Data Sources</CardTitle>
            <CardDescription>
              Automatically discovered feeds, social profiles, and metadata
            </CardDescription>
          </div>
          <form action={reEnrichAction}>
            <input type="hidden" name="companyId" value={company.id} />
            <Button type="submit" size="sm" variant="outline">
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-enrich
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {company.dataSources.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No data sources discovered yet. Enrichment runs automatically after company creation.
            </div>
          )}

          {company.dataSources.length > 0 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">RSS Feeds & Blogs</h4>
                <div className="space-y-1">
                  {feeds.length > 0 ? (
                    feeds.map(source => (
                      <div key={source.id} className="flex items-center justify-between text-sm">
                        <span className="truncate mr-2">{source.label || source.url}</span>
                        <Badge variant="outline">{source.sourceType}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No feeds discovered yet.</p>
                  )}
                </div>
              </div>

              {socials.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Social Profiles</h4>
                  <div className="space-y-1">
                    {socials.map(source => (
                      <div key={source.id} className="flex items-center justify-between text-sm">
                        <span className="truncate mr-2">{source.url}</span>
                        <Badge variant="outline">{source.sourceType}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {company.ticker && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Stock Ticker</h4>
                  <Badge>{company.ticker}</Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
