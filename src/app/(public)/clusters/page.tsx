import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { Container, Headline, Metadata, Separator } from "@/components";
import { ClusterListCard } from "./_components/cluster-list-card";
import { ClusterFilters } from "./_components/cluster-filters";
import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface ClustersPageProps {
  searchParams: Promise<{
    status?: string;
    company?: string;
    sort?: string;
    q?: string;
    cursor?: string;
  }>;
}

const PAGE_SIZE = 20;

const VALID_STATUSES = new Set([
  "EMERGING",
  "ACCELERATING",
  "PEAKED",
  "FADING",
  "RESOLVED",
]);

async function ClustersList({
  status,
  companyId,
  sort,
  query,
  cursor,
}: {
  status?: string;
  companyId?: string;
  sort?: string;
  query?: string;
  cursor?: string;
}) {
  const where: Prisma.SignalThemeWhereInput = {};

  if (status && VALID_STATUSES.has(status)) {
    where.status = status as Prisma.EnumThemeStatusFilter;
  }
  if (companyId) {
    where.companyId = companyId;
  }
  if (query) {
    where.OR = [
      { label: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.SignalThemeOrderByWithRelationInput = (() => {
    if (sort === "signalCount") {
      return { clusteredSignals: { _count: "desc" } };
    }
    if (sort === "lastUpdated") {
      return { lastUpdated: "desc" };
    }
    return { momentum: "desc" };
  })();

  const clusters = await prisma.signalTheme.findMany({
    where,
    take: PAGE_SIZE + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy,
    select: {
      id: true,
      label: true,
      status: true,
      momentum: true,
      lastUpdated: true,
      company: {
        select: { id: true, name: true, ticker: true },
      },
      _count: {
        select: { clusteredSignals: true },
      },
    },
  });

  const hasMore = clusters.length > PAGE_SIZE;
  const items = hasMore ? clusters.slice(0, -1) : clusters;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
        <Headline level={3} size="subheading" className="mb-2">
          No clusters found
        </Headline>
        <Metadata>
          {query
            ? `No clusters match "${query}". Try a different search.`
            : "No strategic clusters have been identified yet."}
        </Metadata>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((cluster) => (
          <ClusterListCard
            key={cluster.id}
            cluster={{
              ...cluster,
              lastUpdated: cluster.lastUpdated.toISOString(),
            }}
          />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-8 pt-4 border-t-2 border-foreground">
        <Metadata>
          Showing {items.length} cluster{items.length !== 1 ? "s" : ""}
        </Metadata>
        <div className="flex gap-2">
          {cursor && (
            <Link
              href={buildPageUrl({ status, companyId, sort, query })}
              className="text-sm font-mono uppercase tracking-widest hover:text-accent transition-colors"
            >
              ← First Page
            </Link>
          )}
          {hasMore && nextCursor && (
            <Link
              href={buildPageUrl({ status, companyId, sort, query, cursor: nextCursor })}
              className="text-sm font-mono uppercase tracking-widest hover:text-accent transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPageUrl(params: {
  status?: string;
  companyId?: string;
  sort?: string;
  query?: string;
  cursor?: string;
}): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.companyId) search.set("company", params.companyId);
  if (params.sort && params.sort !== "momentum") search.set("sort", params.sort);
  if (params.query) search.set("q", params.query);
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return qs ? `/clusters?${qs}` : "/clusters";
}

export default async function ClustersPage({ searchParams }: ClustersPageProps) {
  const { status, company, sort, q, cursor } = await searchParams;

  return (
    <Container className="py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Feed
        </Link>

        <Headline level={2} size="hero" className="mb-2">
          Strategic Clusters
        </Headline>
        <Metadata className="mb-6">
          Cross-signal themes connecting related corporate signals into strategic narratives
        </Metadata>

        <Separator className="mb-6" />

        <Suspense>
          <ClusterFilters />
        </Suspense>
      </div>

      {/* Cluster List */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 border-2 border-foreground animate-pulse" />
            ))}
          </div>
        }
      >
        <ClustersList
          status={status}
          companyId={company}
          sort={sort}
          query={q}
          cursor={cursor}
        />
      </Suspense>
    </Container>
  );
}
