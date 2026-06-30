import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Metadata } from "@/components";
import { Activity } from "lucide-react";
import { prisma } from "@/lib/db";

interface HeatmapCell {
  companyId: string;
  companyName: string;
  day: string;
  count: number;
}

export async function ActivityHeatmap() {
  const heatmapData = await prisma.$queryRaw<HeatmapCell[]>`
    SELECT c.name as "companyName", c.id as "companyId",
           DATE(s."scrapedAt") as day, COUNT(*)::int as count
    FROM "Signal" s
    JOIN "Company" c ON c.id = s."companyId"
    WHERE s.status = 'ANALYZED' AND s."scrapedAt" > NOW() - INTERVAL '14 days'
    GROUP BY c.id, c.name, day
    ORDER BY day
  `;

  if (heatmapData.length === 0) {
    return null;
  }

  // Get top 5 companies by total signal count
  const companyTotals = new Map<string, { name: string; total: number }>();
  for (const cell of heatmapData) {
    const existing = companyTotals.get(cell.companyId);
    if (existing) {
      existing.total += cell.count;
    } else {
      companyTotals.set(cell.companyId, { name: cell.companyName, total: cell.count });
    }
  }

  const topCompanies = Array.from(companyTotals.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([id, data]) => ({ id, name: data.name }));

  // Get unique days - normalize to ISO date strings for proper deduplication
  const days = Array.from(
    new Set(
      heatmapData.map((cell) => {
        const date = new Date(cell.day);
        return date.toISOString().split("T")[0]; // YYYY-MM-DD format
      })
    )
  ).sort();

  // Create lookup map
  const dataMap = new Map<string, number>();
  for (const cell of heatmapData) {
    dataMap.set(`${cell.companyId}-${cell.day}`, cell.count);
  }

  function getIntensity(count: number): string {
    if (count === 0) return "bg-muted/30";
    if (count <= 2) return "bg-primary/20";
    if (count <= 5) return "bg-primary/40";
    return "bg-primary/60";
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="size-4" />
          <CardTitle className="text-lg">Activity Heatmap</CardTitle>
        </div>
        <Metadata>Last 14 days</Metadata>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Day labels */}
          <div className="flex gap-0.5 mb-1">
            <div className="w-20" />
            {days.map((day) => (
              <div
                key={day}
                className="w-4 text-[9px] text-muted-foreground text-center"
              >
                {new Date(day).getDate()}
              </div>
            ))}
          </div>

          {/* Company rows */}
          {topCompanies.map(({ id, name }) => (
            <div key={id} className="flex items-center gap-0.5">
              <div className="w-20 text-[10px] text-muted-foreground truncate">
                {name}
              </div>
              {days.map((day) => {
                const count = dataMap.get(`${id}-${day}`) || 0;
                const formattedDate = new Date(day).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <Tooltip key={`${id}-${day}`}>
                    <TooltipTrigger render={<div />}>
                      <div
                        className={`w-4 h-4 ${getIntensity(count)} transition-colors cursor-pointer`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {name} - {formattedDate}: {count} signal{count !== 1 ? "s" : ""}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
