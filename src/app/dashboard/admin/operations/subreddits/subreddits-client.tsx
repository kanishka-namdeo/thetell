"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  ticker: string | null;
  industry: string | null;
  sector: string | null;
}

interface TrackedSubreddit {
  id: string;
  companyId: string;
  subreddit: string;
  reason: string | null;
  subscriberCount: number | null;
  isActive: boolean;
  discoveredAt: string;
  lastValidatedAt: string;
}

interface DiscoveryLog {
  id: string;
  companyId: string;
  status: string;
  suggestedCount: number;
  validatedCount: number;
  error: string | null;
  llmModel: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface SubredditsClientProps {
  companies: Company[];
}

function formatSubscribers(count: number | null): string {
  if (count === null) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SubredditsClient({ companies }: SubredditsClientProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [subreddits, setSubreddits] = useState<TrackedSubreddit[]>([]);
  const [discoveryLog, setDiscoveryLog] = useState<DiscoveryLog | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newSubreddit, setNewSubreddit] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const fetchSubreddits = useCallback(async () => {
    if (selectedCompanyId === "all") {
      setSubreddits([]);
      setDiscoveryLog(null);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/v1/companies/${selectedCompanyId}/subreddits`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Failed to fetch subreddits");
      const data = await res.json();
      setSubreddits(data.items);
      setDiscoveryLog(data.discoveryLog);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Failed to load tracked subreddits");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchSubreddits sets loading state internally before async work
    fetchSubreddits();
    return () => controllerRef.current?.abort();
  }, [fetchSubreddits]);

  async function handleAdd() {
    if (selectedCompanyId === "all" || !newSubreddit.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch(
        `/api/v1/companies/${selectedCompanyId}/subreddits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subreddit: newSubreddit.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add subreddit");
      toast.success(`Added r/${newSubreddit.trim().toLowerCase()}`);
      setAddDialogOpen(false);
      setNewSubreddit("");
      await fetchSubreddits();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add subreddit"
      );
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(sub: TrackedSubreddit) {
    setTogglingId(sub.id);
    try {
      const res = await fetch(
        `/api/v1/companies/${selectedCompanyId}/subreddits/${sub.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !sub.isActive }),
        }
      );
      if (!res.ok) throw new Error("Failed to toggle");
      setSubreddits((prev) =>
        prev.map((s) =>
          s.id === sub.id ? { ...s, isActive: !s.isActive } : s
        )
      );
      toast.success(
        `r/${sub.subreddit} ${sub.isActive ? "deactivated" : "activated"}`
      );
    } catch {
      toast.error("Failed to toggle subreddit");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(sub: TrackedSubreddit) {
    setDeletingId(sub.id);
    try {
      const res = await fetch(
        `/api/v1/companies/${selectedCompanyId}/subreddits/${sub.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      setSubreddits((prev) => prev.filter((s) => s.id !== sub.id));
      toast.success(`Removed r/${sub.subreddit}`);
    } catch {
      toast.error("Failed to remove subreddit");
    } finally {
      setDeletingId(null);
    }
  }

  const filteredSubreddits = subreddits.filter((s) =>
    s.subreddit.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
        <div className="flex gap-3">
          <svg
            className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium">Discovery operations moved</p>
            <p className="mt-1">
              Subreddit discovery is now managed from the{" "}
              <Link
                href="/dashboard/admin/control-center"
                className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100"
              >
                Control Center
              </Link>
              . You can still manually add and manage subreddits here.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <Card className="border-2 border-foreground">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2 sm:w-72">
              <Label htmlFor="company-select">Company</Label>
              <Select
                value={selectedCompanyId}
                onValueChange={(value) => setSelectedCompanyId(value || "all")}
              >
                <SelectTrigger id="company-select">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                      {company.ticker ? ` (${company.ticker})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCompanyId !== "all" && (
              <div className="flex gap-2">
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger render={<Button variant="outline" size="sm" />}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Subreddit
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Tracked Subreddit</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="subreddit-name">Subreddit Name</Label>
                        <Input
                          id="subreddit-name"
                          placeholder="e.g. biotechnology"
                          value={newSubreddit}
                          onChange={(e) => setNewSubreddit(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isAdding) handleAdd();
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Enter the subreddit name without the r/ prefix. It will
                          be validated via RSS feed.
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setAddDialogOpen(false);
                            setNewSubreddit("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAdd}
                          disabled={isAdding || !newSubreddit.trim()}
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Validating...
                            </>
                          ) : (
                            "Add Subreddit"
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subreddits Table */}
      {selectedCompanyId === "all" ? (
        <Card className="border-2 border-foreground">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a company to view and manage its tracked subreddits.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Tracked Subreddits
                {selectedCompany && (
                  <span className="text-muted-foreground font-body text-sm ml-2">
                    — {selectedCompany.name}
                  </span>
                )}
              </CardTitle>
              <div className="w-56">
                <Input
                  placeholder="Filter subreddits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredSubreddits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {searchQuery
                    ? "No subreddits match your filter."
                    : "No tracked subreddits yet. Run discovery or add one manually."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subreddit</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Subscribers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Discovered</TableHead>
                    <TableHead>Validated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubreddits.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <a
                          href={`https://reddit.com/r/${sub.subreddit}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                        >
                          r/{sub.subreddit}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {sub.reason || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatSubscribers(sub.subscriberCount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sub.isActive ? "default" : "secondary"}
                          className={cn(
                            !sub.isActive && "opacity-60"
                          )}
                        >
                          {sub.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sub.discoveredAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sub.lastValidatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggle(sub)}
                            disabled={togglingId === sub.id}
                            title={
                              sub.isActive ? "Deactivate" : "Activate"
                            }
                          >
                            {togglingId === sub.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : sub.isActive ? (
                              <ToggleRight className="h-4 w-4" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(sub)}
                            disabled={deletingId === sub.id}
                            className="text-destructive hover:text-destructive"
                            title="Remove subreddit"
                          >
                            {deletingId === sub.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Discovery Log */}
      {selectedCompanyId !== "all" && discoveryLog && (
        <Card className="border-2 border-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Last Discovery Run</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Status
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  {discoveryLog.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : discoveryLog.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-warning" />
                  )}
                  <span className="text-sm font-medium capitalize">
                    {discoveryLog.status}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Suggested
                </p>
                <p className="text-2xl font-bold font-mono mt-1">
                  {discoveryLog.suggestedCount}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Validated
                </p>
                <p className="text-2xl font-bold font-mono mt-1">
                  {discoveryLog.validatedCount}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Duration
                </p>
                <p className="text-sm font-mono mt-1">
                  {formatDuration(discoveryLog.durationMs)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Run At
                </p>
                <p className="text-sm mt-1">
                  {new Date(discoveryLog.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            {discoveryLog.error && (
              <div className="mt-4 rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {discoveryLog.error}
                </p>
              </div>
            )}
            {discoveryLog.llmModel && (
              <p className="mt-3 text-xs text-muted-foreground">
                Model: {discoveryLog.llmModel}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
