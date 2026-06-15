import { useState, useEffect, useCallback } from "react";
import { SignalWithRelations, PaginatedApiResponse } from "@/lib/api/schemas";

interface UseSignalsOptions {
  limit?: number;
  companyId?: string | null;
  sourceType?: string | null;
  status?: string | null;
  sentiment?: string | null;
}

export function useSignals(options: UseSignalsOptions = {}) {
  const [data, setData] = useState<SignalWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchSignals = useCallback(async (cursor?: string) => {
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

      const res = await fetch(`/api/v1/signals?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch signals");

      const json: PaginatedApiResponse<SignalWithRelations> = await res.json();
      
      if (cursor) {
        setData((prev) => [...prev, ...json.items]);
      } else {
        setData(json.items);
      }
      
      setHasMore(json.hasMore);
      setNextCursor(json.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [options.limit, options.companyId, options.sourceType, options.status, options.sentiment]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const loadMore = useCallback(() => {
    if (hasMore && nextCursor) {
      fetchSignals(nextCursor);
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
