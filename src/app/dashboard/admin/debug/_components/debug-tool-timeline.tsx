"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Database,
  FileText,
  Terminal,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { DebugEvent } from "@/lib/debug/event-types";

interface DebugToolTimelineProps {
  events: DebugEvent[];
}

type ToolCategory = "database" | "file" | "shell" | "search";

interface TimelineEntry {
  tool: string;
  category: ToolCategory;
  timestamp: number;
  duration: number;
  index: number;
}

const CATEGORY_CONFIG: Record<
  ToolCategory,
  { label: string; color: string; icon: typeof Database }
> = {
  database: { label: "Database", color: "bg-info", icon: Database },
  file: { label: "File ops", color: "bg-success", icon: FileText },
  shell: { label: "Shell", color: "bg-warning", icon: Terminal },
  search: { label: "Search", color: "bg-purple-500", icon: Search },
};

function categorizeTool(tool: string): ToolCategory | null {
  const lower = tool.toLowerCase();
  if (lower.includes("prisma") || lower.includes("query") || lower.includes("db"))
    return "database";
  if (
    lower.includes("read") ||
    lower.includes("write") ||
    lower.includes("edit") ||
    lower.includes("glob") ||
    lower.includes("file")
  )
    return "file";
  if (lower.includes("shell") || lower.includes("exec") || lower.includes("bash") || lower.includes("run"))
    return "shell";
  if (lower.includes("grep") || lower.includes("search") || lower.includes("find") || lower.includes("glob"))
    return "search";
  return "file";
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DebugToolTimeline({ events }: DebugToolTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  const entries = useMemo(() => {
    const toolEvents = events.filter(
      (e) => e.type === "tool_use" && e.tool
    );
    if (toolEvents.length === 0) return [];

    const start = new Date(toolEvents[0].timestamp).getTime();
    const end = new Date(
      toolEvents[toolEvents.length - 1].timestamp
    ).getTime();
    const totalSpan = Math.max(end - start, 1);

    return toolEvents
      .map((e, i) => {
        const cat = categorizeTool(e.tool!);
        if (!cat) return null;
        return {
          tool: e.tool!,
          category: cat,
          timestamp: new Date(e.timestamp).getTime() - start,
          duration: e.duration ?? Math.max(totalSpan * 0.02, 200),
          index: i,
        } satisfies TimelineEntry;
      })
      .filter((e): e is TimelineEntry => e !== null);
  }, [events]);

  const totalSpan = useMemo(() => {
    if (entries.length === 0) return 1;
    return Math.max(
      ...entries.map((e) => e.timestamp + e.duration),
      1
    );
  }, [entries]);

  if (entries.length === 0) return null;

  const visibleEntries = expanded ? entries : entries.slice(-20);
  const categoryCounts = entries.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Tool Timeline</CardTitle>
          <div className="flex items-center gap-3">
            {(Object.keys(CATEGORY_CONFIG) as ToolCategory[]).map((cat) => (
              <div key={cat} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className={cn("h-2 w-2 rounded-full", CATEGORY_CONFIG[cat].color)} />
                <span className="hidden sm:inline">
                  {CATEGORY_CONFIG[cat].label}
                  {categoryCounts[cat] ? ` (${categoryCounts[cat]})` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-0.5">
            {visibleEntries.map((entry) => {
              const config = CATEGORY_CONFIG[entry.category];
              const leftPct = (entry.timestamp / totalSpan) * 100;
              const widthPct = Math.max(
                (entry.duration / totalSpan) * 100,
                1
              );

              return (
                <Tooltip key={entry.index}>
                  <TooltipTrigger>
                    <div className="relative h-5 w-full cursor-default">
                      <div
                        className={cn(
                          "absolute top-0 h-full rounded-sm opacity-70 hover:opacity-100 transition-opacity",
                          config.color
                        )}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          minWidth: "4px",
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="text-xs">
                      <div className="font-medium">{entry.tool}</div>
                      <div className="text-muted-foreground">
                        {formatMs(entry.duration)} &middot;{" "}
                        {config.label}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {entries.length > 20 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show all {entries.length} tool calls
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
