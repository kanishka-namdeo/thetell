"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SentimentTrends } from "@/components/dashboard/sentiment-trends";
import { ConfidenceDistribution } from "@/components/dashboard/confidence-distribution";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function DashboardCharts() {
  const [days, setDays] = useState<number>(30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-serif font-bold">Trends & Distribution</h2>
        <div className="flex items-center gap-1 border border-foreground">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.days}
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs font-mono px-3 py-1 h-auto",
                days === opt.days && "bg-foreground text-background"
              )}
              onClick={() => setDays(opt.days)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <SentimentTrends days={days} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConfidenceDistribution days={days} />
        <SourceBreakdown days={days} />
      </div>
    </div>
  );
}
