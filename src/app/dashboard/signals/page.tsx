"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useSignals } from "@/hooks/use-signals";
import { useCompanies } from "@/hooks/use-companies";
import { SignalTable } from "@/components/dashboard/signal-table";
import { SignalFilters } from "@/components/dashboard/signal-filters";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BarChart3 } from "lucide-react";

export default function SignalsPage() {
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const { data: signals, loading, hasMore, loadMore, refetch } = useSignals({
    sourceType,
    status,
    sentiment,
    companyId,
    limit: 20,
    includeInferences: true,
    includeCorrelations: true,
  });

  const { data: companies } = useCompanies({ limit: 50 });

  const handleClearAll = useCallback(() => {
    setSourceType(null);
    setStatus(null);
    setSentiment(null);
    setCompanyId(null);
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Intelligence
        </p>
        <h1 className="text-3xl font-serif font-bold">Signals</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Public signals tracked and analyzed by the system
        </p>
      </div>

      {/* Filters */}
      <div className="border border-foreground p-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-3">
          Filters
        </p>
        <SignalFilters
          sourceType={sourceType}
          status={status}
          sentiment={sentiment}
          companyId={companyId}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          onSourceTypeChange={setSourceType}
          onStatusChange={setStatus}
          onSentimentChange={setSentiment}
          onCompanyChange={setCompanyId}
          onClearAll={handleClearAll}
        />
      </div>

      <Separator />

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-muted-foreground">
          {signals.length} signal{signals.length !== 1 ? "s" : ""} found
        </p>
        <Button variant="ghost" size="sm" onClick={refetch}>
          Refresh
        </Button>
      </div>

      {/* Signal Table */}
      {!loading && signals.length === 0 ? (
        <div className="text-center py-12 border border-foreground">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground mb-2">
            No signals found
          </p>
          <p className="text-sm text-muted-foreground font-body mb-4">
            {sourceType || status || sentiment || companyId
              ? "Try adjusting your filters."
              : "Add your first signal to start tracking corporate intelligence."}
          </p>
          {!sourceType && !status && !sentiment && !companyId && (
            <Link href="/dashboard/signals/new">
              <Button variant="outline">Add Your First Signal</Button>
            </Link>
          )}
        </div>
      ) : (
        <SignalTable signals={signals} loading={loading} />
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={loadMore}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
