"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Play,
  Settings,
} from "lucide-react";
import Link from "next/link";

interface DataSource {
  id: string;
  url: string;
  sourceType: string;
  label: string | null;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
}

type HealthStatus = "healthy" | "stale" | "failing";

function getHealthStatus(source: DataSource): HealthStatus {
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
  },
  stale: {
    label: "Stale",
    icon: Clock,
    className: "text-warning",
  },
  failing: {
    label: "Failing",
    icon: AlertCircle,
    className: "text-destructive",
  },
};

interface DataSourcesSectionProps {
  feeds: DataSource[];
  socials: DataSource[];
  ticker: string | null;
  companyId: string;
  companyName: string;
  isAdmin: boolean;
}

export function DataSourcesSection({
  feeds,
  socials,
  ticker,
  companyId,
  companyName,
  isAdmin,
}: DataSourcesSectionProps) {
  const [sources, setSources] = useState<DataSource[]>([...feeds, ...socials]);
  const [isVerifying, setIsVerifying] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    sourceId: string | null;
    sourceUrl: string;
  }>({ open: false, sourceId: null, sourceUrl: "" });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

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

  async function handleToggle(source: DataSource) {
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
      toast.success("Source deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete source";
      toast.error(message);
    } finally {
      setIsDeleting(null);
      setDeleteDialog({ open: false, sourceId: null, sourceUrl: "" });
    }
  }

  function formatDate(dateStr: Date | string | null) {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo < 7) return `${daysAgo} days ago`;
    return date.toLocaleDateString();
  }

  const currentFeeds = sources.filter((s) =>
    s.sourceType === "RSS" || s.sourceType === "BLOG" || s.sourceType === "NEWS"
  );
  const currentSocials = sources.filter((s) => s.sourceType === "SOCIAL");
  const activeCount = sources.filter((s) => s.isActive).length;
  const inactiveCount = sources.length - activeCount;

  if (isAdmin) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Data Sources</CardTitle>
            <CardDescription>
              Automatically discovered feeds, social profiles, and metadata
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/dashboard/admin/content/sources?companyId=${companyId}`} />}
          >
            <Settings className="h-3 w-3 mr-1" />
            Manage Sources
          </Button>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No data sources discovered yet. Enrichment runs automatically after company creation.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">{sources.length} total</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>{activeCount} active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{inactiveCount} inactive</span>
                </div>
              </div>
              {sources.length > 0 && (
                <div className="space-y-1">
                  {sources.slice(0, 5).map((source) => {
                    const health = getHealthStatus(source);
                    const healthInfo = healthConfig[health];
                    const HealthIcon = healthInfo.icon;
                    return (
                      <div key={source.id} className="flex items-center gap-2 text-sm">
                        <HealthIcon className={`h-3.5 w-3.5 shrink-0 ${healthInfo.className}`} />
                        <span className="truncate text-muted-foreground">
                          {source.label || source.url}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {source.sourceType}
                        </Badge>
                      </div>
                    );
                  })}
                  {sources.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      +{sources.length - 5} more — see{" "}
                      <Link
                        href={`/dashboard/admin/content/sources?companyId=${companyId}`}
                        className="underline hover:text-foreground"
                      >
                        Manage Sources
                      </Link>
                    </p>
                  )}
                </div>
              )}
              {ticker && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Ticker:</span>
                  <Badge>{ticker}</Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Data Sources</CardTitle>
          <CardDescription>
            Automatically discovered feeds, social profiles, and metadata
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <form action={async (formData) => {
            const companyId = formData.get("companyId");
            // Re-enrich action is handled by the parent page
          }}>
            <input type="hidden" name="companyId" value={companyId} />
            <Button type="submit" size="sm" variant="outline">
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-enrich
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent>
        {sources.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No data sources discovered yet. Enrichment runs automatically after company creation.
          </div>
        )}

        {sources.length > 0 && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">RSS Feeds & Blogs</h4>
              <div className="space-y-1">
                {currentFeeds.length > 0 ? (
                  currentFeeds.map((source) => {
                    const health = getHealthStatus(source);
                    const healthInfo = healthConfig[health];
                    const HealthIcon = healthInfo.icon;

                    return (
                      <div key={source.id} className="flex items-center justify-between text-sm gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <HealthIcon className={`h-4 w-4 shrink-0 ${healthInfo.className}`} />
                          <span className="truncate">{source.label || source.url}</span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {source.sourceType}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No feeds discovered yet.</p>
                )}
              </div>
            </div>

            {currentSocials.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Social Profiles</h4>
                <div className="space-y-1">
                  {currentSocials.map((source) => {
                    const health = getHealthStatus(source);
                    const healthInfo = healthConfig[health];
                    const HealthIcon = healthInfo.icon;

                    return (
                      <div key={source.id} className="flex items-center justify-between text-sm gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <HealthIcon className={`h-4 w-4 shrink-0 ${healthInfo.className}`} />
                          <span className="truncate">{source.url}</span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {source.sourceType}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ticker && (
              <div>
                <h4 className="text-sm font-medium mb-2">Stock Ticker</h4>
                <Badge>{ticker}</Badge>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
