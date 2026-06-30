"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Key,
  Activity,
  Server,
  BarChart3,
  Zap,
  CircleDot,
  ArrowRight,
  Timer,
  Radar,
} from "lucide-react";
import Link from "next/link";
import { PipelineChatModal } from "@/components/admin/pipeline-chat-modal";
import { CorrelationClient } from "./correlation-client";
import { logger } from "@/lib/logger";

interface ScraperStatus {
  name: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  successRate: number;
  errorCount: number;
}

interface ApiKeyStatus {
  name: string;
  configured: boolean;
  masked: string;
}

interface Metrics {
  signalsPerHour: number;
  analysesPerHour: number;
  averageProcessingTime: number;
  errorRate: number;
  averageConfidence: number;
  totalSignals: number;
  totalArticles: number;
  totalUsers: number;
  totalCompanies: number;
  pendingSignals: number;
  failedSignals: number;
  totalProcessed: number;
  cluster?: {
    clusteredSignals: number;
    standaloneSignals: number;
    activeClusters: number;
    totalClusters: number;
    avgClusterSize: number;
    clusterArticles: number;
    llmCallsSaved: number;
  };
}

interface JobStatus {
  pending: number;
  running: number;
  failed: number;
  completed: number;
}

interface RecentError {
  id: string;
  source: string;
  message: string;
  timestamp: string;
  signalId?: string;
}

interface HealthData {
  scrapers: ScraperStatus[];
  apiKeys: ApiKeyStatus[];
  metrics: Metrics;
  jobs: JobStatus;
  recentErrors: RecentError[];
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

export function SystemHealthClient() {
  const [data, setData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchHealth = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/system/health", { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: HealthData = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
      setCountdown(30);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHealth();
    return () => controllerRef.current?.abort();
  }, [fetchHealth]);

  useEffect(() => {
    const interval = setInterval(fetchHealth, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const tickCountdown = useCallback(() => {
    setCountdown((c) => (c <= 1 ? 30 : c - 1));
  }, []);

  useEffect(() => {
    const tick = setInterval(tickCountdown, 1000);
    return () => clearInterval(tick);
  }, [tickCountdown]);

  const enabledCount = data?.scrapers.filter((s) => s.enabled).length ?? 0;
  const totalScrapers = data?.scrapers.length ?? 0;
  const configuredKeys = data?.apiKeys.filter((k) => k.configured).length ?? 0;
  const totalKeys = data?.apiKeys.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Refresh Bar */}
      <div className="flex items-center justify-between">
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
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHealth}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">Failed to load system health: {error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Orchestrator Card */}
      <Card className="border-2 border-foreground">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4" />
              <CardTitle className="text-base">Pipeline Orchestrator</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              Real-time discovery
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Discover and configure data sources for any company using AI-powered MCP servers.
            Watch the discovery process in real-time with full transparency.
          </p>
          <PipelineChatModal
            trigger={
              <span
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <Radar className="h-3 w-3" />
                Launch Orchestrator
              </span>
            }
            onApply={(result) => {
              logger.debug("system_health.sources_applied", { result });
              // Optionally refresh the page or show a toast
            }}
          />
        </CardContent>
      </Card>

      {/* Signal Clustering */}
      <CorrelationClient />

      {/* Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading && !data ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3 px-4">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-12" />
              </CardContent>
            </Card>
          ))
        ) : data ? (
          <>
            <MetricMini
              label="Signals/hr"
              value={data.metrics.signalsPerHour}
              icon={Zap}
            />
            <MetricMini
              label="Analyses/hr"
              value={data.metrics.analysesPerHour}
              icon={Activity}
            />
            <MetricMini
              label="Error Rate"
              value={`${data.metrics.errorRate}%`}
              icon={AlertTriangle}
              warn={data.metrics.errorRate > 10}
            />
            <MetricMini
              label="Avg Confidence"
              value={`${Math.round(data.metrics.averageConfidence * 100)}%`}
              icon={BarChart3}
            />
            <MetricMini
              label="Pending"
              value={data.jobs.pending}
              icon={Clock}
              warn={data.jobs.pending > 50}
            />
            <MetricMini
              label="Failed"
              value={data.jobs.failed}
              icon={XCircle}
              warn={data.jobs.failed > 0}
            />
          </>
        ) : null}
      </div>

      {/* Two-column: Scrapers + Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scraper Status */}
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Scraper Status
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {enabledCount}/{totalScrapers} active
                </Badge>
                <Link href="/dashboard/admin/operations/scrapers">
                  <Button variant="ghost" size="sm" className="text-xs h-7">
                    Manage <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {data?.scrapers.map((scraper) => (
                  <div
                    key={scraper.name}
                    className="flex items-center justify-between py-1.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {scraper.enabled ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{scraper.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {scraper.successRate > 0 && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {scraper.successRate}%
                        </span>
                      )}
                      <Badge
                        variant={scraper.enabled ? "default" : "outline"}
                        className="text-[10px] h-5"
                      >
                        {scraper.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job Queue */}
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Job Queue
              </CardTitle>
              <Link href="/dashboard/admin/operations/jobs">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  Monitor <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data ? (
              <div className="grid grid-cols-2 gap-3">
                <JobStat label="Pending" value={data.jobs.pending} icon={Clock} color="text-warning" />
                <JobStat label="Running" value={data.jobs.running} icon={CircleDot} color="text-info" />
                <JobStat label="Completed" value={data.jobs.completed} icon={CheckCircle2} color="text-success" />
                <JobStat label="Failed" value={data.jobs.failed} icon={XCircle} color="text-destructive" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Two-column: API Keys + System Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Keys */}
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Keys
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {configuredKeys}/{totalKeys} configured
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {data?.apiKeys.map((key) => (
                  <div
                    key={key.name}
                    className="flex items-center justify-between py-1.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {key.configured ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      )}
                      <span className="text-sm font-medium">{key.name}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {key.masked}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Totals */}
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              System Totals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data ? (
              <div className="grid grid-cols-2 gap-4">
                <TotalStat label="Total Signals" value={data.metrics.totalSignals} />
                <TotalStat label="Total Articles" value={data.metrics.totalArticles} />
                <TotalStat label="Total Users" value={data.metrics.totalUsers} />
                <TotalStat label="Companies" value={data.metrics.totalCompanies} />
                <TotalStat label="Processed" value={data.metrics.totalProcessed} />
                <TotalStat
                  label="Failed"
                  value={data.metrics.failedSignals}
                  warn={data.metrics.failedSignals > 0}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Cluster Metrics */}
      {data?.metrics.cluster && (
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Radar className="h-4 w-4" />
                Cluster Analysis
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {data.metrics.cluster.activeClusters} active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">Clustered Signals</p>
                <p className="text-2xl font-serif font-bold">{data.metrics.cluster.clusteredSignals}</p>
                <p className="text-xs text-muted-foreground">{data.metrics.cluster.standaloneSignals} standalone</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">Total Clusters</p>
                <p className="text-2xl font-serif font-bold">{data.metrics.cluster.totalClusters}</p>
                <p className="text-xs text-muted-foreground">avg {data.metrics.cluster.avgClusterSize} signals each</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">Cluster Articles</p>
                <p className="text-2xl font-serif font-bold">{data.metrics.cluster.clusterArticles}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">LLM Calls Saved</p>
                <p className="text-2xl font-serif font-bold text-success">{data.metrics.cluster.llmCallsSaved.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">vs full dual-agent analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors */}
      <Card className="border-2 border-foreground">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recent Errors
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Last {data?.recentErrors.length ?? 0} errors
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data?.recentErrors.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 mx-auto text-success mb-2" />
              <p className="text-sm text-muted-foreground">No recent errors</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="min-w-[200px]">Message</TableHead>
                  <TableHead className="text-right w-32">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.recentErrors.map((err) => (
                  <TableRow key={err.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize whitespace-nowrap">
                        {err.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm min-w-0 max-w-md truncate">
                      {err.message}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(err.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricMini({
  label,
  value,
  icon: Icon,
  warn = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-3 pb-2 px-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={`h-3 w-3 ${warn ? "text-warning" : "text-muted-foreground"}`} />
          <span className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground">
            {label}
          </span>
        </div>
        <p className={`text-xl font-serif font-bold ${warn ? "text-warning" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function JobStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  color: string;
}) {
  return (
    <div className="border-2 border-foreground p-3 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
      <p className="text-2xl font-serif font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function TotalStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-serif font-bold ${warn ? "text-destructive" : ""}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
