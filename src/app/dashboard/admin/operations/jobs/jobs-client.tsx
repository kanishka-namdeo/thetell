"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  RefreshCw,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Play,
} from "lucide-react";

interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  createdAt: string;
}

interface JobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  avgDuration: number;
  successRate: number;
}

export function JobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchJobs = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);

      const res = await fetch(`/api/v1/admin/jobs?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setStats(data.stats ?? null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Failed to load jobs");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJobs();
    return () => controllerRef.current?.abort();
  }, [fetchJobs]);

  async function retryJob(jobId: string) {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/v1/admin/jobs/${jobId}/retry`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Retry failed");
      }

      toast.success("Job retry initiated");
      fetchJobs();
    } catch (error) {
      toast.error(`Retry failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setRetrying(null);
    }
  }

  async function cancelJob(jobId: string) {
    if (!confirm("Are you sure you want to cancel this job?")) return;

    setCancelling(jobId);
    try {
      const res = await fetch(`/api/v1/admin/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Cancel failed");
      }

      toast.success("Job cancelled");
      fetchJobs();
    } catch (error) {
      toast.error(`Cancel failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setCancelling(null);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return "—";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  function getJobTypeDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      "analyze-signal": "Analyze Signal",
      "discover-signals-unified": "Signal Discovery",
      "discover-signals-cron": "Signal Discovery (Cron)",
    };
    return displayNames[type] || type;
  }

  function getStatusBadge(status: string) {
    const config = {
      pending: { icon: Clock, color: "bg-warning", label: "Pending" },
      running: { icon: Loader2, color: "bg-info", label: "Running" },
      completed: { icon: CheckCircle2, color: "bg-success", label: "Completed" },
      failed: { icon: XCircle, color: "bg-destructive", label: "Failed" },
    }[status] || { icon: AlertCircle, color: "bg-muted-foreground", label: status };

    const Icon = config.icon;
    return (
      <Badge variant="outline" className="gap-1">
        <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
        {config.label}
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Running
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-info">{stats.running}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select value={statusFilter} onValueChange={(value) => { if (value) setStatusFilter(value); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Type:</span>
              <Select value={typeFilter} onValueChange={(value) => { if (value) setTypeFilter(value); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="analyze-signal">Analyze Signal</SelectItem>
                  <SelectItem value="discover-signals-unified">Signal Discovery</SelectItem>
                  <SelectItem value="discover-signals-cron">Signal Discovery (Cron)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchJobs} className="ml-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg">Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No jobs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">
                      {job.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-medium">{getJobTypeDisplayName(job.type)}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {formatDuration(job.duration)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {job.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryJob(job.id)}
                            disabled={retrying === job.id}
                          >
                            {retrying === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            <span className="sr-only">Retry</span>
                          </Button>
                        )}
                        {job.status === "running" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelJob(job.id)}
                            disabled={cancelling === job.id}
                          >
                            {cancelling === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            <span className="sr-only">Cancel</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
