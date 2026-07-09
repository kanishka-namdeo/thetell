"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { AdminEmptyState } from "@/components/admin/states";
import {
  Database,
  Filter,
  Loader2,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Info,
  X,
} from "lucide-react";
import Link from "next/link";

interface CompanyDataSource {
  id: string;
  url: string;
  sourceType: string;
  label: string | null;
  discoveryMethod: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  httpStatusCode: number | null;
  failureReason: string | null;
  createdAt: string;
  company: {
    id: string;
    name: string;
  };
}

type HealthStatus = "healthy" | "stale" | "failing";

function getHealthStatus(source: CompanyDataSource): HealthStatus {
  if (source.consecutiveFailures > 3) return "failing";
  if (!source.lastCheckedAt) return "stale";
  const daysSince = (Date.now() - new Date(source.lastCheckedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 7) return "stale";
  return "healthy";
}

const healthConfig = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    className: "text-success",
    badgeVariant: "default" as const,
  },
  stale: {
    label: "Stale",
    icon: Clock,
    className: "text-warning",
    badgeVariant: "secondary" as const,
  },
  failing: {
    label: "Failing",
    icon: AlertCircle,
    className: "text-destructive",
    badgeVariant: "destructive" as const,
  },
};

export default function SourcesManagementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sources, setSources] = useState<CompanyDataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    sourceId: string | null;
    sourceUrl: string;
  }>({ open: false, sourceId: null, sourceUrl: "" });
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sourceTypeFilter, setSourceTypeFilter] = useState(searchParams.get("sourceType") || "");
  const [discoveryMethodFilter, setDiscoveryMethodFilter] = useState(searchParams.get("discoveryMethod") || "");
  const [healthFilter, setHealthFilter] = useState(searchParams.get("health") || "");
  const companyIdFilter = searchParams.get("companyId") || "";
  const [filterCompanyName, setFilterCompanyName] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isBulkVerifying, setIsBulkVerifying] = useState(false);
  const [isBulkToggling, setIsBulkToggling] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchSources = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (search) params.set("search", search);
      if (sourceTypeFilter) params.set("sourceType", sourceTypeFilter);
      if (discoveryMethodFilter) params.set("discoveryMethod", discoveryMethodFilter);
      if (healthFilter) params.set("health", healthFilter);
      if (companyIdFilter) params.set("companyId", companyIdFilter);

      const response = await fetch(`/api/v1/admin/sources?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch sources");
      }

      const data = await response.json();
      setSources(data.sources);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to fetch sources";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [search, sourceTypeFilter, discoveryMethodFilter, healthFilter, companyIdFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSources();
    return () => controllerRef.current?.abort();
  }, [fetchSources]);

  useEffect(() => {
    if (companyIdFilter) {
      fetch(`/api/v1/companies/${companyIdFilter}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.name) setFilterCompanyName(data.name);
        })
        .catch((error) => {
          logger.warn("sources.company_fetch_failed", { companyId: companyIdFilter, error: String(error) });
        });
    }
  }, [companyIdFilter]);

  async function handleVerify(sourceId: string) {
    setIsVerifying(sourceId);
    try {
      const response = await fetch(`/api/v1/admin/sources/${sourceId}/verify`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to verify source");
      }

      const data = await response.json();
      setSources((prev) => prev.map((s) => (s.id === sourceId ? data.source : s)));
      toast.success(data.verification.reachable ? "Source verified successfully" : "Source verification failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to verify source";
      toast.error(message);
    } finally {
      setIsVerifying(null);
    }
  }

  async function handleToggle(source: CompanyDataSource) {
    setIsToggling(source.id);
    try {
      const response = await fetch(`/api/v1/admin/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !source.isActive }),
      });

      if (!response.ok) {
        throw new Error("Failed to toggle source");
      }

      const data = await response.json();
      setSources((prev) => prev.map((s) => (s.id === source.id ? data : s)));
      toast.success(data.isActive ? "Source activated" : "Source deactivated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to toggle source";
      toast.error(message);
    } finally {
      setIsToggling(null);
    }
  }

  async function handleDelete() {
    if (!deleteDialog.sourceId) return;

    setIsDeleting(deleteDialog.sourceId);
    try {
      const response = await fetch(`/api/v1/admin/sources/${deleteDialog.sourceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete source");
      }

      setSources((prev) => prev.filter((s) => s.id !== deleteDialog.sourceId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteDialog.sourceId!);
        return next;
      });
      toast.success("Source deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete source";
      toast.error(message);
    } finally {
      setIsDeleting(null);
      setDeleteDialog({ open: false, sourceId: null, sourceUrl: "" });
    }
  }

  async function handleBulkVerify() {
    if (selectedIds.size === 0) return;

    setIsBulkVerifying(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/v1/admin/sources/${id}/verify`, { method: "POST" }).then((r) => r.json())
        )
      );

      const successes = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`Verified ${successes} of ${selectedIds.size} sources`);
      setSelectedIds(new Set());
      fetchSources();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to verify sources";
      toast.error(message);
    } finally {
      setIsBulkVerifying(false);
    }
  }

  async function handleBulkToggle() {
    if (selectedIds.size === 0) return;

    setIsBulkToggling(true);
    try {
      const selectedSources = sources.filter((s) => selectedIds.has(s.id));
      const results = await Promise.allSettled(
        selectedSources.map((source) =>
          fetch(`/api/v1/admin/sources/${source.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !source.isActive }),
          }).then((r) => r.json())
        )
      );

      const successes = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`Toggled ${successes} of ${selectedIds.size} sources`);
      setSelectedIds(new Set());
      fetchSources();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to toggle sources";
      toast.error(message);
    } finally {
      setIsBulkToggling(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;

    setIsBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/v1/admin/sources/${id}`, { method: "DELETE" }).then((r) => r.json())
        )
      );

      const successes = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`Deleted ${successes} of ${selectedIds.size} sources`);
      setSelectedIds(new Set());
      fetchSources();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete sources";
      toast.error(message);
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sources.map((s) => s.id)));
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo < 7) return `${daysAgo} days ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
              Content
            </p>
            <h1 className="text-3xl font-serif font-bold">Data Sources</h1>
            <p className="text-sm text-muted-foreground font-body mt-1">
              {sources.length} sources{selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
            </p>
          </div>
          </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Operations Moved</AlertTitle>
        <AlertDescription>
          Discovery operations are now in the{" "}
          <Link href="/dashboard/admin/control-center" className="underline font-medium">
            Control Center
          </Link>
        </AlertDescription>
      </Alert>

      {companyIdFilter && (
        <Alert>
          <Filter className="h-4 w-4" />
          <AlertTitle>Filtered by company</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            <span>
              Showing sources for <strong>{filterCompanyName || "this company"}</strong>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("companyId");
                router.push(`?${params.toString()}`);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Clear filter
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search URL or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-auto sm:min-w-[200px]"
              />
            </div>
            <Select
              value={sourceTypeFilter}
              onValueChange={(v) => setSourceTypeFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="All source types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All source types</SelectItem>
                <SelectItem value="RSS">RSS</SelectItem>
                <SelectItem value="BLOG">Blog</SelectItem>
                <SelectItem value="NEWS">News</SelectItem>
                <SelectItem value="SOCIAL">Social</SelectItem>
                <SelectItem value="FILING">Filing</SelectItem>
                <SelectItem value="TRANSCRIPT">Transcript</SelectItem>
                <SelectItem value="JOB_POSTING">Job Posting</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={discoveryMethodFilter}
              onValueChange={(v) => setDiscoveryMethodFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="All discovery methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All discovery methods</SelectItem>
                <SelectItem value="website-probe">Website Probe</SelectItem>
                <SelectItem value="pipeline-orchestrator">Pipeline Orchestrator</SelectItem>
                <SelectItem value="enrichment">Enrichment</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="seed">Seed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={healthFilter}
              onValueChange={(v) => setHealthFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[140px]">
                <SelectValue placeholder="All health statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All health statuses</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="stale">Stale</SelectItem>
                <SelectItem value="failing">Failing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-2 border-foreground bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {selectedIds.size} source{selectedIds.size > 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-2">
                <Button onClick={handleBulkVerify} size="sm" disabled={isBulkVerifying}>
                  {isBulkVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Verify Selected
                    </>
                  )}
                </Button>
                <Button onClick={handleBulkToggle} size="sm" variant="outline" disabled={isBulkToggling}>
                  {isBulkToggling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Toggling...
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4 mr-2" />
                      Toggle Selected
                    </>
                  )}
                </Button>
                <Button onClick={handleBulkDelete} variant="destructive" size="sm" disabled={isBulkDeleting}>
                  {isBulkDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{error}</p>
            <Button onClick={fetchSources} variant="outline">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-2 border-foreground overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedIds.size === sources.length && sources.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="min-w-[250px]">URL</TableHead>
                <TableHead>Source Type</TableHead>
                <TableHead>Discovery Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last Checked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && sources.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-64" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-24 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                sources.map((source) => {
                  const health = getHealthStatus(source);
                  const healthInfo = healthConfig[health];
                  const HealthIcon = healthInfo.icon;

                  return (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(source.id)}
                          onCheckedChange={() => toggleSelect(source.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium min-w-0 max-w-[150px] truncate">
                        {source.company.name}
                      </TableCell>
                      <TableCell className="min-w-0 max-w-[300px]">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-xs">{source.label || source.url}</span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{source.sourceType}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {source.discoveryMethod}
                      </TableCell>
                      <TableCell>
                        <Badge variant={source.isActive ? "default" : "secondary"}>
                          {source.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 ${healthInfo.className}`}>
                          <HealthIcon className="h-4 w-4" />
                          <span className="text-xs">{healthInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(source.lastCheckedAt)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVerify(source.id)}
                            disabled={isVerifying === source.id || isDeleting === source.id}
                          >
                            {isVerifying === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggle(source)}
                            disabled={isToggling === source.id || isDeleting === source.id}
                          >
                            {isToggling === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : source.isActive ? (
                              <ToggleRight className="h-4 w-4 text-success" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteDialog({
                                open: true,
                                sourceId: source.id,
                                sourceUrl: source.url,
                              })
                            }
                            disabled={isDeleting === source.id}
                          >
                            {isDeleting === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && sources.length === 0 && !error && (
          <AdminEmptyState
            icon={Database}
            title="No data sources found"
            description="Data sources will appear here after enrichment or discovery runs"
          />
        )}
      </Card>

      {hasMore && nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("cursor", nextCursor);
              router.push(`?${params.toString()}`);
            }}
          >
            Load More
          </Button>
        </div>
      )}

      <Dialog
        open={deleteDialog.open}
        onOpenChange={() => setDeleteDialog({ open: false, sourceId: null, sourceUrl: "" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Data Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this data source? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground break-all">
            {deleteDialog.sourceUrl}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, sourceId: null, sourceUrl: "" })}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
