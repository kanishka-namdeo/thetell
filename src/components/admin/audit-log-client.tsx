"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminEmptyState } from "@/components/admin/states";
import { Search, Download, Filter, FileSearch, AlertTriangle } from "lucide-react";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string | null;
  };
}

export function AuditLogClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const isInitialMount = useRef(true);

  const fetchLogs = useCallback(async (cursor?: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (actionFilter) params.set("action", actionFilter);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");

      const response = await fetch(`/api/v1/admin/audit?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Failed to fetch audit logs");

      const data = await response.json();
      setLogs((prev) => cursor ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("audit_log.fetch_failed", { error: String(error) });
      setError(error instanceof Error ? error.message : "Failed to fetch audit logs");
    } finally {
      setIsLoading(false);
    }
  }, [search, actionFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    return () => controllerRef.current?.abort();
  }, [actionFilter, fetchLogs]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchLogs();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchLogs]);

  function formatAction(action: string): string {
    return action
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function formatDetails(details: unknown): string {
    if (!details) return "";
    if (typeof details === "string") return details;
    try {
      const json = JSON.stringify(details, null, 0);
      return json.length > 100 ? json.slice(0, 100) + "..." : json;
    } catch {
      return String(details);
    }
  }

  function handleExportCSV() {
    const csvContent = [
      ["Timestamp", "User", "Action", "Resource", "Resource ID", "Details", "IP Address"].join(","),
      ...logs.map((log) =>
        [
          new Date(log.createdAt).toISOString(),
          log.user.name || log.user.email || "Unknown",
          log.action,
          log.resource,
          log.resourceId || "",
          JSON.stringify(log.details || ""),
          log.ipAddress || "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <div className="flex-1 min-w-0 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search actions, resources..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v || "")}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All actions</SelectItem>
                <SelectItem value="user.create">User Create</SelectItem>
                <SelectItem value="user.update">User Update</SelectItem>
                <SelectItem value="user.delete">User Delete</SelectItem>
                <SelectItem value="settings.update">Settings Update</SelectItem>
                <SelectItem value="content.moderate">Content Moderate</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportCSV} className="shrink-0">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Showing {logs.length} of {total} entries
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Audit Log Table */}
      <Card className="border-2 border-foreground overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="min-w-[150px]">Details</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && logs.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="font-medium min-w-0 max-w-[180px] truncate">
                    {log.user.name || log.user.email || "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {formatAction(log.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm min-w-0 max-w-[150px] truncate">
                    {log.resource}
                    {log.resourceId && (
                      <span className="text-muted-foreground ml-1">
                        ({log.resourceId.slice(0, 8)}...)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground min-w-0 max-w-[200px] truncate">
                    {formatDetails(log.details)}
                  </TableCell>
                  <TableCell className="text-xs font-mono whitespace-nowrap">
                    {log.ipAddress || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>

        {hasMore && (
          <div className="flex justify-center p-4 border-t">
            <Button
              variant="outline"
              onClick={() => fetchLogs(nextCursor!)}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}

        {!isLoading && logs.length === 0 && !error && (
          <AdminEmptyState
            icon={FileSearch}
            title="No audit logs found"
            description="Audit logs will appear here when actions are performed"
          />
        )}
      </Card>
    </div>
  );
}
