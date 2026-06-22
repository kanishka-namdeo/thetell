"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useCompanies } from "@/hooks/use-companies";
import { InferenceCard } from "@/components/dashboard/inference-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InferenceStatus =
  | "EMERGING"
  | "DEVELOPING"
  | "CONFIRMED"
  | "REFUTED"
  | "RESOLVED";

type ThemeStatus =
  | "EMERGING"
  | "ACCELERATING"
  | "PEAKED"
  | "FADING"
  | "RESOLVED";

interface InferenceData {
  id: string;
  title: string;
  hypothesis: string;
  confidence: number;
  status: InferenceStatus;
  supportingSignalIds: string[];
  sourceTypesInvolved: string[];
  company: {
    name: string;
    ticker?: string | null;
    slug: string;
  };
  theme?: {
    id: string;
    label: string;
    status: ThemeStatus;
    momentum: number;
    signalCount?: number;
  } | null;
  crossSignalDebate?: {
    analystPosition: {
      position: string;
      reasoning: string;
      keyEvidence?: string[];
    };
    gossipPosition: {
      position: string;
      reasoning: string;
      keyEvidence?: string[];
    };
    agreements?: string[];
    contentions?: Array<{
      topic: string;
      analystView: string;
      gossipView: string;
    }>;
    synthesis?: string;
  } | null;
  debate?: {
    consensusReached: boolean;
    analystClaim?: string;
    gossipClaim?: string;
  } | null;
}

interface PaginatedInferencesResponse {
  items: InferenceData[];
  hasMore: boolean;
  nextCursor: string | null;
}

type SortOption = "confidence" | "createdAt";

export function InferencesClient() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("confidence");

  const { data: companies } = useCompanies({ limit: 50 });

  const fetchInferences = async (cursor?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    if (companyId) params.set("companyId", companyId);
    if (status) params.set("status", status);
    params.set("sortBy", sortBy);

    const res = await fetch(`/api/v1/inferences?${params.toString()}`, { signal });
    if (!res.ok) throw new Error("Failed to fetch inferences");
    return res.json();
  };

  const {
    data: inferences,
    loading,
    hasMore,
    loadMore,
  } = useInferenceFetcher(fetchInferences, [companyId, status, sortBy]);

  const handleClearAll = useCallback(() => {
    setCompanyId(null);
    setStatus(null);
    setSortBy("confidence");
  }, []);

  if (loading && inferences.length === 0) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="border-b-2 border-foreground pb-4">
          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
            Strategic Insights
          </p>
          <h1 className="text-3xl font-serif font-bold">Inferences</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Strategic Insights
        </p>
        <h1 className="text-3xl font-serif font-bold">Inferences</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          AI-generated strategic inferences from cross-signal analysis
        </p>
      </div>

      {/* Filters */}
      <div className="border border-foreground p-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-3">
          Filters & Sort
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <Select
            value={companyId || ""}
            onValueChange={(v) => setCompanyId(v || null)}
          >
            <SelectTrigger className="w-[180px]">Company</SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.ticker && ` (${c.ticker})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status || ""} onValueChange={(v) => setStatus(v || null)}>
            <SelectTrigger className="w-[150px]">Status</SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="EMERGING">Emerging</SelectItem>
              <SelectItem value="DEVELOPING">Developing</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="REFUTED">Refuted</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy((v as SortOption) || "confidence")}
          >
            <SelectTrigger className="w-[180px]">Sort by</SelectTrigger>
            <SelectContent>
              <SelectItem value="confidence">Confidence (High → Low)</SelectItem>
              <SelectItem value="createdAt">Newest First</SelectItem>
            </SelectContent>
          </Select>

          {(companyId || status || sortBy !== "confidence") && (
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <p className="text-xs font-mono text-muted-foreground">
        {inferences.length} inference{inferences.length !== 1 ? "s" : ""} found
      </p>

      {/* Inferences Grid */}
      {inferences.length === 0 ? (
        <div className="text-center py-12 border border-foreground">
          <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground mb-2">
            No inferences found
          </p>
          <p className="text-sm text-muted-foreground font-body mb-4">
            {companyId || status
              ? "Try adjusting your filters."
              : "Inferences will appear here once the system detects cross-signal patterns."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inferences.map((inference) => (
              <InferenceCard
                key={inference.id}
                inference={inference}
                supportingSignalCount={inference.supportingSignalIds.length}
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

function useInferenceFetcher(
  fetcher: (cursor?: string, signal?: AbortSignal) => Promise<PaginatedInferencesResponse>,
  deps: unknown[]
) {
  const [data, setData] = useState<InferenceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    const controller = new AbortController();

    const fetchInitial = async () => {
      try {
        setLoading(true);
        const result = await fetcher(undefined, controller.signal);
        if (!cancelledRef.current) {
          setData(result.items);
          setHasMore(result.hasMore);
          setNextCursor(result.nextCursor);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!cancelledRef.current) console.error(err);
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    fetchInitial();

    return () => {
      cancelledRef.current = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    return () => {
      loadMoreControllerRef.current?.abort();
    };
  }, []);

  const loadMore = () => {
    if (hasMore && nextCursor) {
      loadMoreControllerRef.current?.abort();
      const controller = new AbortController();
      loadMoreControllerRef.current = controller;
      setLoading(true);
      fetcher(nextCursor, controller.signal)
        .then((result) => {
          if (!cancelledRef.current) {
            setData((prev) => [...prev, ...result.items]);
            setHasMore(result.hasMore);
            setNextCursor(result.nextCursor);
          }
        })
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return;
          if (!cancelledRef.current) console.error(err);
        })
        .finally(() => {
          if (!cancelledRef.current) setLoading(false);
        });
    }
  };

  return { data, loading, hasMore, loadMore };
}
