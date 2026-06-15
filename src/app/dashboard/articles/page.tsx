"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCompanies } from "@/hooks/use-companies";
import { ArticleCard } from "@/components/dashboard/article-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  summary: string;
  company: {
    name: string;
    ticker: string | null;
  };
  publishedAt: string | null;
  status: "DRAFT" | "PUBLISHED";
  author: {
    name: string | null;
  } | null;
}

interface PaginatedArticlesResponse {
  items: ArticleData[];
  hasMore: boolean;
  nextCursor: string | null;
}

export default function ArticlesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const { data: companies } = useCompanies({ limit: 50 });

  const fetchArticles = async (cursor?: string) => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    if (companyId) params.set("companyId", companyId);
    if (status) params.set("status", status);

    const res = await fetch(`/api/v1/articles?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch articles");
    return res.json();
  };

  const {
    data: articles,
    loading,
    hasMore,
    loadMore,
  } = useArticleFetcher(fetchArticles, [companyId, status]);

  if (loading && articles.length === 0) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="border-b-2 border-foreground pb-4">
          <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
            Intelligence Reports
          </p>
          <h1 className="text-3xl font-serif font-bold">Articles</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Intelligence Reports
        </p>
        <h1 className="text-3xl font-serif font-bold">Articles</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          AI-generated analysis and strategic insights
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={companyId || ""}
          onValueChange={(v) => setCompanyId(v || null)}
        >
          <SelectTrigger>Company</SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status || ""} onValueChange={(v) => setStatus(v || null)}>
          <SelectTrigger>Status</SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
          </SelectContent>
        </Select>

        {(companyId || status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCompanyId(null);
              setStatus(null);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Results Count */}
      <p className="text-xs font-mono text-muted-foreground">
        {articles.length} article{articles.length !== 1 ? "s" : ""} found
      </p>

      {/* Articles Grid */}
      {articles.length === 0 ? (
        <div className="text-center py-12 border border-foreground">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground mb-2">
            No articles found
          </p>
          <p className="text-sm text-muted-foreground font-body mb-4">
            {companyId || status
              ? "Try adjusting your filters."
              : "Articles will appear here once generated from analyzed signals."}
          </p>
          {!companyId && !status && (
            <Link href="/dashboard/signals/new">
              <Button variant="outline">Generate Your First Article</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                id={article.id}
                title={article.title}
                slug={article.slug}
                summary={article.summary}
                companyName={article.company.name}
                companyTicker={article.company.ticker}
                publishedAt={article.publishedAt}
                status={article.status}
                authorName={article.author?.name ?? null}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMore}>
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function useArticleFetcher(fetcher: (cursor?: string) => Promise<PaginatedArticlesResponse>, deps: unknown[]) {
  const [data, setData] = useState<ArticleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadData = async (cursor?: string) => {
    try {
      setLoading(true);
      const result = await fetcher(cursor);
      if (cursor) {
        setData((prev) => [...prev, ...result.items]);
      } else {
        setData(result.items);
      }
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    
    const fetchInitial = async () => {
      try {
        setLoading(true);
        const result = await fetcher();
        if (!cancelled) {
          setData(result.items);
          setHasMore(result.hasMore);
          setNextCursor(result.nextCursor);
        }
      } catch (err) {
        if (!cancelled) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInitial();
    
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = () => {
    if (hasMore && nextCursor) {
      loadData(nextCursor);
    }
  };

  return { data, loading, hasMore, loadMore };
}
