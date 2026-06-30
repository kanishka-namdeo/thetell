"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Metadata } from "@/components";
import { SlidersHorizontal } from "lucide-react";

interface TacticalFilterBarProps {
  companies: Array<{ id: string; name: string }>;
  onFilterChange: (filters: {
    company: string | null;
    status: string | null;
    sort: string;
  }) => void;
  resultCount: number;
}

const STATUS_OPTIONS = [
  { value: "EMERGING", label: "Emerging" },
  { value: "DEVELOPING", label: "Developing" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "REFUTED", label: "Refuted" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "confidence", label: "Highest Confidence" },
  { value: "signals", label: "Most Signals" },
];

export function TacticalFilterBar({
  companies,
  onFilterChange,
  resultCount,
}: TacticalFilterBarProps) {
  const [company, setCompany] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<string>("recent");
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasActiveFilters = company !== null || status !== null || sort !== "recent";

  const companyName = company ? companies.find((c) => c.id === company)?.name : null;

  const emitChange = useCallback(
    (c: string | null, s: string | null, so: string) => {
      onFilterChange({ company: c, status: s, sort: so });
    },
    [onFilterChange]
  );

  useEffect(() => {
    emitChange(company, status, sort);
  }, [company, status, sort, emitChange]);

  function handleCompanyChange(val: string | null) {
    setCompany(val === "all" || val === null ? null : val);
  }

  function handleStatusChange(val: string | null) {
    setStatus(val === "all" || val === null ? null : val);
  }

  function handleSortChange(val: string | null) {
    setSort(val ?? "recent");
  }

  function clearAll() {
    setCompany(null);
    setStatus(null);
    setSort("recent");
  }

  const filtersContent = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={company} onValueChange={handleCompanyChange}>
        <SelectTrigger className="h-9 min-w-[160px]">
          <SelectValue placeholder="All Companies">
            {companyName || "All Companies"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Companies</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={handleStatusChange}>
        <SelectTrigger className="h-9 min-w-[140px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={handleSortChange}>
        <SelectTrigger className="h-9 min-w-[160px]">
          <SelectValue placeholder="Sort by">
            {SORT_OPTIONS.find((o) => o.value === sort)?.label || "Most Recent"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-9">
          Clear All
        </Button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:block border border-foreground/20 p-3">
        <div className="flex flex-wrap items-center gap-3">
          {filtersContent}
          <Metadata className="ml-auto">{resultCount} results</Metadata>
        </div>
      </div>

      {/* Mobile: collapsible */}
      <Collapsible open={mobileOpen} onOpenChange={setMobileOpen} className="md:hidden">
        <div className="flex items-center justify-between border border-foreground/20 p-3">
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="h-9 gap-2" />}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {hasActiveFilters && (
              <span className="inline-flex size-5 items-center justify-center bg-foreground text-background text-[10px]">
                {(company ? 1 : 0) + (status ? 1 : 0) + (sort !== "recent" ? 1 : 0)}
              </span>
            )}
          </CollapsibleTrigger>
          <Metadata>{resultCount} results</Metadata>
        </div>
        <CollapsibleContent>
          <div className="border border-t-0 border-foreground/20 p-3 space-y-3">
            {filtersContent}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
