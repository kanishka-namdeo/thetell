"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "EMERGING", label: "Emerging" },
  { value: "ACCELERATING", label: "Accelerating" },
  { value: "PEAKED", label: "Peaked" },
  { value: "FADING", label: "Fading" },
  { value: "RESOLVED", label: "Resolved" },
];

const SORT_OPTIONS = [
  { value: "momentum", label: "Momentum" },
  { value: "signalCount", label: "Signal Count" },
  { value: "lastUpdated", label: "Most Recent" },
];

interface ClusterFiltersProps {
  className?: string;
}

export function ClusterFilters({ className }: ClusterFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const initialStatus = searchParams.get("status") ?? "";
  const initialSort = searchParams.get("sort") ?? "momentum";
  const initialQuery = searchParams.get("q") ?? "";

  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [query, setQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUrl = useCallback(
    (next: { status?: string; sort?: string; q?: string }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.status !== undefined) {
        if (next.status) params.set("status", next.status);
        else params.delete("status");
      }
      if (next.sort !== undefined) {
        if (next.sort && next.sort !== "momentum") params.set("sort", next.sort);
        else params.delete("sort");
      }
      if (next.q !== undefined) {
        if (next.q) params.set("q", next.q);
        else params.delete("q");
      }

      const qs = params.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      router.push(target, { scroll: false });
    },
    [router, searchParams, pathname]
  );

  const handleStatusChange = (value: string | null) => {
    const next = !value || value === "all" ? "" : value;
    setStatus(next);
    updateUrl({ status: next });
  };

  const handleSortChange = (value: string | null) => {
    const next = value || "momentum";
    setSort(next);
    updateUrl({ sort: next });
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateUrl({ q: value });
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClear = () => {
    setStatus("");
    setSort("momentum");
    setQuery("");
    router.push(pathname, { scroll: false });
  };

  const hasFilters = status || sort !== "momentum" || query;

  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:items-center", className)}>
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search clusters…"
          aria-label="Search clusters"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="pl-9 pr-9 h-9 font-sans text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={status || "all"} onValueChange={handleStatusChange}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "all"} value={opt.value || "all"}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={handleSortChange}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-xs"
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
