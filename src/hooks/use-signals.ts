import { useState, useEffect, useCallback, useRef } from "react";
import { SignalWithRelations, PaginatedApiResponse } from "@/lib/api/schemas";

interface UseSignalsOptions {
  limit?: number;
  companyId?: string | null;
  sourceType?: string | null;
  status?: string | null;
  sentiment?: string | null;
  clusterId?: string | null;
  includeInferences?: boolean;
  includeCorrelations?: boolean;
}

export function useSignals(options: UseSignalsOptions = {}) {
  const [data, setData] = useState<SignalWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const fetchSignals = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", String(options.limit || 20));
      if (cursor) params.set("cursor", cursor);
      if (options.companyId) params.set("companyId", options.companyId);
      if (options.sourceType) params.set("sourceType", options.sourceType);
      if (options.status) params.set("status", options.status);
      if (options.sentiment) params.set("sentiment", options.sentiment);
      if (options.clusterId) params.set("clusterId", options.clusterId);
      if (options.includeInferences) params.set("includeInferences", "true");
      if (options.includeCorrelations) params.set("includeCorrelations", "true");

      const res = await fetch(`/api/v1/signals?${params.toString()}`, { signal });
      if (!res.ok) throw new Error("Failed to fetch signals");

      const json: PaginatedApiResponse<SignalWithRelations> = await res.json();

      // Deduplicate by signal ID to prevent "duplicate key" React errors
      const uniqueItems = Array.from(
        new Map(json.items.map((item) => [item.id, item])).values()
      );

      if (cursor) {
        setData((prev) => {
          // Also deduplicate against existing items when appending
          const existingIds = new Set(prev.map((item) => item.id));
          const newItems = uniqueItems.filter((item) => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      } else {
        setData(uniqueItems);
      }
      
      setHasMore(json.hasMore);
      setNextCursor(json.nextCursor);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [options.limit, options.companyId, options.sourceType, options.status, options.sentiment, options.clusterId, options.includeInferences, options.includeCorrelations]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      await fetchSignals(undefined, controller.signal);
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, [fetchSignals]);

  useEffect(() => {
    return () => {
      loadMoreControllerRef.current?.abort();
    };
  }, []);

  const loadMore = useCallback(() => {
    if (hasMore && nextCursor) {
      loadMoreControllerRef.current?.abort();
      const controller = new AbortController();
      loadMoreControllerRef.current = controller;
      fetchSignals(nextCursor, controller.signal);
    }
  }, [hasMore, nextCursor, fetchSignals]);

  const refetch = useCallback(() => {
    fetchSignals();
  }, [fetchSignals]);

  return {
    data,
    loading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}
