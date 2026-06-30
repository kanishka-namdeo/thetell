"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Metadata } from "@/components";
import { cn } from "@/lib/utils";
import { ListFilter } from "lucide-react";

interface SourceTypeCount {
  sourceType: string;
  count: number;
}

interface SourceTypeFilterProps {
  sourceTypeCounts: SourceTypeCount[];
}

export function SourceTypeFilter({ sourceTypeCounts }: SourceTypeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSourceType = searchParams.get("sourceType");

  function toggleSourceType(sourceType: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (sourceType === null) {
      params.delete("sourceType");
    } else {
      params.set("sourceType", sourceType);
    }
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/");
  }

  if (sourceTypeCounts.length === 0) {
    return null;
  }

  return (
    <div className="border border-foreground/20 p-3">
      <div className="flex items-center gap-2 mb-3">
        <ListFilter className="size-4" />
        <Metadata>FILTER BY SOURCE</Metadata>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleSourceType(null)}
          className={cn(
            "h-8 px-3 text-xs",
            currentSourceType === null
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </Button>
        {sourceTypeCounts.map(({ sourceType, count }) => (
          <Button
            key={sourceType}
            variant="ghost"
            size="sm"
            onClick={() => toggleSourceType(sourceType)}
            className={cn(
              "h-8 px-3 text-xs",
              currentSourceType === sourceType
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {sourceType} ({count})
          </Button>
        ))}
      </div>
    </div>
  );
}
