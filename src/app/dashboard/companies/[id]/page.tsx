import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SignalTable } from "@/components/dashboard/signal-table";
import { ArticleCard } from "@/components/dashboard/article-card";
import { WatchlistButton } from "@/components/dashboard/watchlist-button";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

interface CompanyDetailPageProps {
  params: { id: string };
}

export default async function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const session = await auth();
  
  const company = await prisma.company.findUnique({
    where: { id: params.id },
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
      _count: {
        select: { signals: true, articles: true },
      },
    },
  });

  if (!company) {
    notFound();
  }

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
                onToggle={() => {}}
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
