"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  Clock,
  Timer,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDot,
} from "lucide-react";

type PipelineStatus = "completed" | "running" | "failed" | "never_run";

interface PipelineSummary {
  scraperName: string;
  sourceType: string;
  status: PipelineStatus;
  lastRunAt: string | null;
  signalsCount: number;
}

interface PipelineCompany {
  id: string;
  name: string;
  ticker: string | null;
  website: string | null;
  totalSignals: number;
  lastActivityAt: string | null;
  pipelines: PipelineSummary[];
}

interface PipelinesData {
  companies: PipelineCompany[];
  timestamp: string;
}

const REFRESH_INTERVAL = 30_000;

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusDot({ status }: { status: PipelineStatus }) {
  const base = "h-2.5 w-2.5 rounded-full inline-block";
  switch (status) {
    case "completed":
      return <span className={`${base} bg-success`} title="Completed" />;
    case "running":
      return (
        <span
          className={`${base} bg-warning animate-pulse`}
          title="Running"
        />
      );
    case "failed":
      return <span className={`${base} bg-destructive`} title="Failed" />;
    case "never_run":
    default:
      return <span className={`${base} bg-muted-foreground/40`} title="Never run" />;
  }
}

function ActiveCount({ pipelines }: { pipelines: PipelineSummary[] }) {
  const active = pipelines.filter(
    (p) => p.status === "completed" || p.status === "running"
  ).length;
  const total = pipelines.length;
  return (
    <Badge variant="outline" className="text-xs font-mono">
      {active}/{total} active
    </Badge>
  );
}

export function PipelinesClient() {
  const router = useRouter();
  const [data, setData] = useState<PipelinesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [search, setSearch] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/pipelines", { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PipelinesData = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
      setCountdown(30);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    return () => controllerRef.current?.abort();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 30 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const filtered = useMemo(() => {
    if (!data?.companies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.companies;
    return data.companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ticker && c.ticker.toLowerCase().includes(q))
    );
  }, [data, search]);

  const hasRunning = data?.companies.some((c) =>
    c.pipelines.some((p) => p.status === "running")
  );

  return (
    <div className="space-y-6">
      {/* Refresh Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
          {lastRefresh && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            Refresh in {countdown}s
          </span>
          {hasRunning && (
            <Badge variant="outline" className="text-[10px] text-warning border-warning">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Pipelines running
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={isLoading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">
                Failed to load pipelines: {error}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card className="border-2 border-foreground">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Companies</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ticker..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearch(e.target.value)
                }
                className="pl-8 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {data?.companies.length === 0
                  ? "No companies with pipeline data yet"
                  : "No companies match your search"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Company</TableHead>
                  <TableHead>Pipeline Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead className="text-right">Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((company) => (
                  <TableRow
                    key={company.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/dashboard/admin/operations/pipelines/${company.id}`)
                    }
                  >
                    <TableCell className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{company.name}</span>
                        {company.ticker && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {company.ticker}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {company.pipelines.map((p) => (
                          <StatusDot key={p.scraperName} status={p.status} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActiveCount pipelines={company.pipelines} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {company.totalSignals.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(company.lastActivityAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono flex-wrap">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-success" />
          Completed
        </span>
        <span className="flex items-center gap-1.5">
          <CircleDot className="h-3 w-3 text-warning" />
          Running
        </span>
        <span className="flex items-center gap-1.5">
          <XCircle className="h-3 w-3 text-destructive" />
          Failed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 inline-block" />
          Never run
        </span>
      </div>
    </div>
  );
}
