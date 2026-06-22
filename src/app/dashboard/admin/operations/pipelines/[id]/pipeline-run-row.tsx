"use client";

import { useState } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  CircleDot,
  AlertTriangle,
} from "lucide-react";

interface PipelineLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

interface PipelineRun {
  id: string;
  scraperName: string;
  status: "completed" | "running" | "failed";
  signalsCreated: number;
  duplicatesSkipped: number;
  durationMs: number;
  startedAt: string;
  completedAt: string | null;
  logs: PipelineLog[];
}

interface Props {
  run: PipelineRun;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusBadge({ status }: { status: PipelineRun["status"] }) {
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
  }
}

export function PipelineRunRow({ run }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-medium">{run.scraperName}</TableCell>
        <TableCell>
          <StatusBadge status={run.status} />
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {run.signalsCreated}
        </TableCell>
        <TableCell className="text-right font-mono text-sm text-muted-foreground">
          {run.duplicatesSkipped}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatDuration(run.durationMs)}
        </TableCell>
        <TableCell className="text-right text-xs font-mono text-muted-foreground">
          {formatRelativeTime(run.startedAt)}
        </TableCell>
      </TableRow>
      {expanded && run.logs.length > 0 && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            <div className="py-4 px-6 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Run Logs
              </p>
              <div className="space-y-2">
                {run.logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap pt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {log.level === "error" ? (
                      <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    ) : log.level === "warn" ? (
                      <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        INFO
                      </Badge>
                    )}
                    <p className="flex-1 font-mono text-sm">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
