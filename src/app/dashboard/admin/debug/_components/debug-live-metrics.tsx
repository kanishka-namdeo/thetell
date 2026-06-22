"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Cpu,
  FileText,
  Wrench,
} from "lucide-react";
import type { DebugEvent } from "@/lib/debug/event-types";

interface DebugLiveMetricsProps {
  events: DebugEvent[];
  isRunning: boolean;
}

function useElapsed(isRunning: boolean, startTime: number) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, startTime]);

  return elapsed;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DebugLiveMetrics({ events, isRunning }: DebugLiveMetricsProps) {
  const [startTime] = useState(() => Date.now());
  const elapsed = useElapsed(isRunning, startTime);

  const metrics = useMemo(() => {
    const toolCalls = events.filter((e) => e.type === "tool_use");
    const toolCounts: Record<string, number> = {};
    let filesTouched = 0;

    for (const e of toolCalls) {
      const tool = e.tool || "unknown";
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;

      const input = e.tool_input as Record<string, unknown> | null;
      if (
        tool === "Read" ||
        tool === "Write" ||
        tool === "Edit" ||
        tool === "Glob" ||
        tool === "Grep"
      ) {
        filesTouched++;
      } else if (input && typeof input === "object" && "path" in input) {
        filesTouched++;
      }
    }

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const maxCount = topTools.length > 0 ? topTools[0][1] : 1;

    return { toolCalls: toolCalls.length, topTools, maxCount, filesTouched };
  }, [events]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Live Metrics
          {isRunning && (
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 ml-auto">
              Live
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {formatDuration(elapsed)}
              </div>
              <div className="text-xs text-muted-foreground">Elapsed</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {metrics.toolCalls}
              </div>
              <div className="text-xs text-muted-foreground">Tool calls</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {metrics.filesTouched}
              </div>
              <div className="text-xs text-muted-foreground">Files touched</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {events.length}
              </div>
              <div className="text-xs text-muted-foreground">Total events</div>
            </div>
          </div>
        </div>

        {metrics.topTools.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Top tools
            </div>
            {metrics.topTools.map(([tool, count]) => (
              <div key={tool} className="flex items-center gap-2">
                <span className="text-xs w-20 truncate font-mono text-muted-foreground">
                  {tool}
                </span>
                <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-sm transition-all duration-300"
                    style={{ width: `${(count / metrics.maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums w-6 text-right">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
