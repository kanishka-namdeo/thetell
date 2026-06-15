"use client";

import Link from "next/link";
import { useCompanies } from "@/hooks/use-companies";
import { CompanyCard } from "@/components/dashboard/company-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

export default function CompaniesPage() {
  const { data: companies, loading, hasMore, loadMore } = useCompanies({ limit: 20 });

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="border-b-2 border-foreground pb-4">
          <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
            Organizations
          </p>
          <h1 className="text-3xl font-serif font-bold">Companies</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
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
          Organizations
        </p>
        <h1 className="text-3xl font-serif font-bold">Companies</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Organizations being monitored for strategic signals
        </p>
      </div>

      {/* Results Count */}
      <p className="text-xs font-mono text-muted-foreground">
        {companies.length} compan{companies.length !== 1 ? "ies" : "y"} found
      </p>

      {/* Company Grid */}
      {companies.length === 0 ? (
        <div className="text-center py-12 border border-foreground">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground mb-2">
            No companies found
          </p>
          <p className="text-sm text-muted-foreground font-body mb-4">
            Start tracking companies to see their signals here
          </p>
          <Link href="/dashboard/companies/new">
            <Button variant="outline">Add Your First Company</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                id={company.id}
                name={company.name}
                slug={company.slug}
                ticker={company.ticker}
                description={company.description}
                signalCount={company._count.signals}
                articleCount={company._count.articles}
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
