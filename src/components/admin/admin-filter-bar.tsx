"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter } from "lucide-react";

export interface AdminFilterOption {
  value: string;
  label: string;
}

export interface AdminFilterConfig {
  key: string;
  label: string;
  options: AdminFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface AdminFilterBarProps {
  filters: AdminFilterConfig[];
  leadingElement?: ReactNode;
}

export function AdminFilterBar({
  filters,
  leadingElement,
}: AdminFilterBarProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          {leadingElement}
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={filter.value}
              onValueChange={(v) => filter.onChange(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{filter.label}</SelectItem>
                {filter.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminFilterBarWithIcon({
  filters,
}: {
  filters: AdminFilterConfig[];
}) {
  return (
    <AdminFilterBar
      filters={filters}
      leadingElement={
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      }
    />
  );
}
