"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logger } from "@/lib/logger";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminEmptyState } from "@/components/admin/states";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SessionStatus = "running" | "completed" | "failed" | "cancelled";

interface SessionItem {
  id: string;
  sessionId: string;
  companyName: string;
  companyId: string | null;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  user: { name: string | null; email: string | null };
  sourcesDiscovered: number;
}

const statusConfig = {
  running: { icon: Loader2, label: "Running", variant: "outline" as const, className: "text-info border-info" },
  completed: { icon: CheckCircle2, label: "Completed", variant: "outline" as const, className: "text-success border-success" },
  failed: { icon: XCircle, label: "Failed", variant: "outline" as const, className: "text-destructive border-destructive" },
  cancelled: { icon: CircleDot, label: "Cancelled", variant: "outline" as const, className: "text-muted-foreground border-muted" },
};

function StatusBadge({ status }: { status: SessionStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={cn("flex items-center gap-1.5", config.className)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {config.label}
    </Badge>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function PipelineSessionsClient() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchSessions = useCallback(async (cursor?: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/v1/admin/pipelines/sessions?${params}`, {
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (cursor) {
        setSessions((prev) => [...prev, ...data.sessions]);
      } else {
        setSessions(data.sessions);
      }
      setNextCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("pipeline_sessions.fetch_failed", { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSessions();
    return () => controllerRef.current?.abort();
  }, [fetchSessions]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-foreground overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && sessions.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                sessions.map((session) => {
                  const duration = session.completedAt
                    ? formatDuration(session.startedAt, session.completedAt)
                    : "In progress...";

                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.companyName}</TableCell>
                      <TableCell><StatusBadge status={session.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(session.startedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{duration}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{session.sourcesDiscovered}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {session.user?.name || session.user?.email || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/dashboard/admin/operations/pipelines/sessions/${session.id}`)
                          }
                        >
                          View <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && sessions.length === 0 && (
          <AdminEmptyState
            icon={Clock}
            title="No sessions found"
            description="Pipeline discovery sessions will appear here"
          />
        )}
      </Card>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchSessions(nextCursor!)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
