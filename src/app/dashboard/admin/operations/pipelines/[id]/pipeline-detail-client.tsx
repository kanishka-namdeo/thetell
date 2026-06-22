"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  Clock,
  Timer,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Play,
  Loader2,
} from "lucide-react";
import { PipelineCard } from "./pipeline-card";
import { PipelineRunRow } from "./pipeline-run-row";

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

interface CompanyDetail {
  id: string;
  name: string;
  ticker: string | null;
  website: string | null;
  totalSignals: number;
  pipelines: PipelineDetail[];
  recentRuns: PipelineRun[];
}

interface Props {
  companyId: string;
}

export function PipelineDetailClient({ companyId }: Props) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [isRunning, setIsRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const hasRunning = company?.pipelines.some((p) => p.status === "running");
  const hasRunningRef = useRef(hasRunning);
  useEffect(() => {
    hasRunningRef.current = hasRunning;
  }, [hasRunning]);
  const pollInterval = hasRunning ? 10_000 : 30_000;

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(`/api/v1/admin/pipelines/${companyId}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CompanyDetail = await res.json();
      setCompany(json);
      setError(null);
      setLastRefresh(new Date());
      setCountdown(hasRunningRef.current ? 10 : 30);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    return () => controllerRef.current?.abort();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? (hasRunning ? 10 : 30) : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [hasRunning]);

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const res = await fetch(`/api/v1/admin/pipelines/${companyId}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start pipeline");
      const data = await res.json();
      console.log("Pipeline started:", data);
      // Refresh immediately
      await fetchData();
    } catch (err) {
      console.error("Failed to start pipeline:", err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/admin/operations/pipelines")}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Pipelines
      </Button>

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
        <div className="flex items-center gap-2">
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
          <Button
            variant="default"
            size="sm"
            onClick={handleRunNow}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run All Pipelines
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">Failed to load pipeline: {error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && !company ? (
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      ) : company ? (
        <>
          {/* Company Header */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-2xl">{company.name}</CardTitle>
                    {company.ticker && (
                      <Badge variant="outline" className="text-sm">
                        {company.ticker}
                      </Badge>
                    )}
                  </div>
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      {company.website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold font-mono">
                    {company.totalSignals.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Total Signals
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Pipeline Grid */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Scraper Pipelines</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {company.pipelines.map((pipeline) => (
                <PipelineCard key={pipeline.scraperName} pipeline={pipeline} />
              ))}
            </div>
          </div>

          {/* Recent Runs */}
          <Card className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="text-lg">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {company.recentRuns.length === 0 ? (
                <div className="text-center py-10">
                  <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No recent runs</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Scraper</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Signals</TableHead>
                      <TableHead className="text-right">Duplicates</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.recentRuns.map((run) => (
                      <PipelineRunRow key={run.id} run={run} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
