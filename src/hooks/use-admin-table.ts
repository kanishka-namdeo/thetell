"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

interface FilterState {
  [key: string]: string;
}

interface UseAdminTableOptions<T> {
  endpoint: string;
  transformResponse?: (data: unknown) => T[];
  initialFilters?: FilterState;
  limit?: number;
}

interface UseAdminTableReturn<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
  selectedIds: Set<string>;
  filters: FilterState;
  fetchData: () => Promise<void>;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setFilter: (key: string, value: string) => void;
  clearAllFilters: () => void;
}

export function useAdminTable<T>({
  endpoint,
  transformResponse,
  initialFilters = {},
  limit = 50,
}: UseAdminTableOptions<T>): UseAdminTableReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }

      const response = await fetch(`${endpoint}?${params}`, {
        signal: controller.signal,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }

      const json = await response.json();

      if (transformResponse) {
        setData(transformResponse(json));
      } else {
        setData(json.items ?? json.data ?? json);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message =
        error instanceof Error ? error.message : "Failed to fetch data";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, filters, limit, transformResponse]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    return () => controllerRef.current?.abort();
  }, [fetchData]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return {
    data,
    isLoading,
    error,
    selectedIds,
    filters,
    fetchData,
    toggleSelection,
    selectAll,
    clearSelection,
    setFilter,
    clearAllFilters,
  };
}
