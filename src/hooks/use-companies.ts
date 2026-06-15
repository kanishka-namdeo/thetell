import { useState, useEffect, useCallback } from "react";
import { CompanyWithCounts, PaginatedApiResponse } from "@/lib/api/schemas";

interface UseCompaniesOptions {
  limit?: number;
}

export function useCompanies(options: UseCompaniesOptions = {}) {
  const [data, setData] = useState<CompanyWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchCompanies = useCallback(async (cursor?: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", String(options.limit || 20));
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/v1/companies?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch companies");

      const json: PaginatedApiResponse<CompanyWithCounts> = await res.json();
      
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
  }, [options.limit]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const loadMore = useCallback(() => {
    if (hasMore && nextCursor) {
      fetchCompanies(nextCursor);
    }
  }, [hasMore, nextCursor, fetchCompanies]);

  const refetch = useCallback(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return {
    data,
    loading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}
