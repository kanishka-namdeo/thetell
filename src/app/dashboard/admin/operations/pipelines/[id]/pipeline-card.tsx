"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  CircleDot,
  Clock,
  AlertTriangle,
} from "lucide-react";

type PipelineStatus = "completed" | "running" | "failed" | "never_run";

interface PipelineLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

interface PipelineDetail {
  scraperName: string;
  displayName: string;
  sourceType: string;
  platformName: string;
  status: PipelineStatus;
  totalSignals: number;
  lastRunAt: string | null;
  logs: PipelineLog[];
}

interface Props {
  pipeline: PipelineDetail;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusBadge({ status }: { status: PipelineStatus }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="outline" className="text-xs bg-success/10 border-success text-success">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "running":
      return (
        <Badge variant="outline" className="text-xs bg-warning/10 border-warning text-warning">
          <CircleDot className="h-3 w-3 mr-1 animate-pulse" />
          Running
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "never_run":
    default:
      return (
        <Badge variant="muted" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Never Run
        </Badge>
      );
  }
}

export function PipelineCard({ pipeline }: Props) {
  const recentLogs = pipeline.logs.slice(0, 3);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{pipeline.displayName}</CardTitle>
            <p className="text-xs text-muted-foreground">{pipeline.platformName}</p>
          </div>
          <StatusBadge status={pipeline.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Source Type</span>
          <Badge variant="outline" className="text-xs font-mono">
            {pipeline.sourceType}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Signals</span>
          <span className="font-mono font-semibold">
            {pipeline.totalSignals.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last Run</span>
          <span className="text-xs font-mono text-muted-foreground">
            {formatRelativeTime(pipeline.lastRunAt)}
          </span>
        </div>

        {recentLogs.length > 0 && (
          <div className="pt-3 border-t space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recent Logs
            </p>
            <div className="space-y-1.5">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs">
                  {log.level === "error" ? (
                    <XCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                  ) : log.level === "warn" ? (
                    <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0 mt-0.5" />
                  ) : (
                    <span className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground font-mono truncate">
                      {log.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
