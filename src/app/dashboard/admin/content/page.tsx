"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AdminEmptyState } from "@/components/admin/states";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { CheckCircle2, XCircle, Eye, Edit, Trash2, FileText, AlertTriangle, Loader2, Info } from "lucide-react";
import Link from "next/link";

interface ContentItem {
  id: string;
  type: "signal" | "article";
  title: string;
  status: string;
  sourceType?: string;
  agentPersona?: string;
  companyName: string;
  confidence?: number;
  sentiment?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  summary?: string;
  clusterLabel?: string;
}

interface SignalApiItem {
  id: string;
  title: string;
  status: string;
  sourceType?: string;
  company: { name: string };
  cluster?: { label: string } | null;
  analyses?: Array<{
    confidence?: number;
    sentiment?: string;
    summary?: string;
  }>;
  createdAt: string;
  updatedAt?: string;
}

interface ArticleApiItem {
  id: string;
  title: string;
  status: string;
  agentPersona?: string;
  company: { name: string };
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string | null;
  summary?: string;
}

export default function ContentPage() {
  const searchParams = useSearchParams();
  const [rawSignalsData, setRawSignalsData] = useState<{ items: SignalApiItem[] }>({ items: [] });
  const [rawArticlesData, setRawArticlesData] = useState<{ items: ArticleApiItem[] }>({ items: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    itemId: string;
    itemType: string;
  }>({ open: false, itemId: "", itemType: "" });
  const [rejectReason, setRejectReason] = useState("");
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    item: ContentItem | null;
  }>({ open: false, item: null });
  const [editTitle, setEditTitle] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    item: ContentItem | null;
  }>({ open: false, item: null });
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [sourceTypeFilter, setSourceTypeFilter] = useState(
    searchParams.get("sourceType") || ""
  );
  const [confidenceFilter, setConfidenceFilter] = useState(
    searchParams.get("confidence") || ""
  );
  const [sentimentFilter, setSentimentFilter] = useState(
    searchParams.get("sentiment") || ""
  );
  const controllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (sourceTypeFilter) params.set("sourceType", sourceTypeFilter);
      if (confidenceFilter) params.set("confidence", confidenceFilter);
      if (sentimentFilter) params.set("sentiment", sentimentFilter);
      params.set("limit", "50");

      const [signalsRes, articlesRes] = await Promise.all([
        fetch(`/api/v1/admin/moderation/signals?${params}`, { signal: controller.signal }),
        fetch(`/api/v1/admin/moderation/articles?${params}`, { signal: controller.signal }),
      ]);

      if (!signalsRes.ok || !articlesRes.ok) {
        throw new Error("Failed to fetch content");
      }

      const signalsData = await signalsRes.json();
      const articlesData = await articlesRes.json();

      setRawSignalsData(signalsData);
      setRawArticlesData(articlesData);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to fetch content";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter, sourceTypeFilter, confidenceFilter, sentimentFilter]);

  const items = useMemo(() => {
    const combinedItems: ContentItem[] = [
      ...rawSignalsData.items.map((s: SignalApiItem) => ({
        id: s.id,
        type: "signal" as const,
        title: s.title,
        status: s.status,
        sourceType: s.sourceType,
        companyName: s.company.name,
        confidence: s.analyses?.[0]?.confidence,
        sentiment: s.analyses?.[0]?.sentiment,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt || s.createdAt,
        summary: s.analyses?.[0]?.summary,
        clusterLabel: s.cluster?.label,
      })),
      ...rawArticlesData.items.map((a: ArticleApiItem) => ({
        id: a.id,
        type: "article" as const,
        title: a.title,
        status: a.status,
        agentPersona: a.agentPersona,
        companyName: a.company.name,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt || a.createdAt,
        publishedAt: a.publishedAt,
        summary: a.summary,
      })),
    ];

    combinedItems.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return combinedItems;
  }, [rawSignalsData, rawArticlesData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    return () => controllerRef.current?.abort();
  }, [fetchData]);

  async function handleApprove(itemId: string, itemType: string) {
    setIsApproving(itemId);
    try {
      const endpoint =
        itemType === "signal"
          ? `/api/v1/admin/content/signals/${itemId}`
          : `/api/v1/admin/content/articles/${itemId}`;
      const statusValue = itemType === "signal" ? "ANALYZED" : "PUBLISHED";
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusValue }),
      });
      if (!response.ok) throw new Error("Failed to approve item");
      if (itemType === "signal") {
        setRawSignalsData((prev) => ({
          items: prev.items.map((s) => s.id === itemId ? { ...s, status: statusValue } : s),
        }));
      } else {
        setRawArticlesData((prev) => ({
          items: prev.items.map((a) => a.id === itemId ? { ...a, status: statusValue } : a),
        }));
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      toast.success("Item approved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to approve";
      toast.error(message);
    } finally {
      setIsApproving(null);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reject reason");
      return;
    }
    setIsRejecting(rejectDialog.itemId);
    try {
      const endpoint =
        rejectDialog.itemType === "signal"
          ? `/api/v1/admin/content/signals/${rejectDialog.itemId}`
          : `/api/v1/admin/content/articles/${rejectDialog.itemId}`;
      const statusValue = rejectDialog.itemType === "signal" ? "REJECTED" : "DRAFT";
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusValue }),
      });
      if (!response.ok) throw new Error("Failed to reject item");
      if (rejectDialog.itemType === "signal") {
        setRawSignalsData((prev) => ({
          items: prev.items.map((s) => s.id === rejectDialog.itemId ? { ...s, status: statusValue } : s),
        }));
      } else {
        setRawArticlesData((prev) => ({
          items: prev.items.map((a) => a.id === rejectDialog.itemId ? { ...a, status: statusValue } : a),
        }));
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(rejectDialog.itemId);
        return next;
      });
      setRejectDialog({ open: false, itemId: "", itemType: "" });
      setRejectReason("");
      toast.success("Item rejected");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reject";
      toast.error(message);
    } finally {
      setIsRejecting(null);
    }
  }

  async function handleEdit() {
    if (!editDialog.item || !editTitle.trim()) return;
    setIsEditing(true);
    try {
      const endpoint =
        editDialog.item.type === "signal"
          ? `/api/v1/admin/content/signals/${editDialog.item.id}`
          : `/api/v1/admin/content/articles/${editDialog.item.id}`;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle }),
      });
      if (!response.ok) throw new Error("Failed to update content");
      if (editDialog.item.type === "signal") {
        setRawSignalsData((prev) => ({
          items: prev.items.map((s) => s.id === editDialog.item!.id ? { ...s, title: editTitle } : s),
        }));
      } else {
        setRawArticlesData((prev) => ({
          items: prev.items.map((a) => a.id === editDialog.item!.id ? { ...a, title: editTitle } : a),
        }));
      }
      setEditDialog({ open: false, item: null });
      setEditTitle("");
      toast.success("Content updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update";
      toast.error(message);
    } finally {
      setIsEditing(false);
    }
  }

  async function handleDelete() {
    if (!deleteDialog.item) return;
    setIsDeleting(true);
    try {
      const endpoint =
        deleteDialog.item.type === "signal"
          ? `/api/v1/admin/content/signals/${deleteDialog.item.id}`
          : `/api/v1/admin/content/articles/${deleteDialog.item.id}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete content");
      if (deleteDialog.item.type === "signal") {
        setRawSignalsData((prev) => ({
          items: prev.items.filter((s) => s.id !== deleteDialog.item!.id),
        }));
      } else {
        setRawArticlesData((prev) => ({
          items: prev.items.filter((a) => a.id !== deleteDialog.item!.id),
        }));
      }
      setDeleteDialog({ open: false, item: null });
      toast.success("Content deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setIsBulkApproving(true);
    try {
      const response = await fetch(`/api/v1/admin/moderation/bulk?action=approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!response.ok) throw new Error("Failed to bulk approve");
      await fetchData();
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""} approved`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to bulk approve";
      toast.error(message);
    } finally {
      setIsBulkApproving(false);
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    const reason = prompt("Enter rejection reason for all selected items:");
    if (!reason) return;
    setIsBulkRejecting(true);
    try {
      const response = await fetch(`/api/v1/admin/moderation/bulk?action=reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), reason }),
      });
      if (!response.ok) throw new Error("Failed to bulk reject");
      await fetchData();
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""} rejected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to bulk reject";
      toast.error(message);
    } finally {
      setIsBulkRejecting(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const confirmed = confirm(`Delete ${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`);
    if (!confirmed) return;
    setIsBulkDeleting(true);
    try {
      const deletePromises = Array.from(selectedIds).map((id) => {
        const item = items.find((i) => i.id === id);
        if (!item) return Promise.resolve();
        const endpoint =
          item.type === "signal"
            ? `/api/v1/admin/content/signals/${id}`
            : `/api/v1/admin/content/articles/${id}`;
        return fetch(endpoint, { method: "DELETE" });
      });
      await Promise.all(deletePromises);
      await fetchData();
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""} deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to bulk delete";
      toast.error(message);
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function openEditDialog(item: ContentItem) {
    setEditDialog({ open: true, item });
    setEditTitle(item.title);
  }

  function getStatusColor(status: string): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "ANALYZED":
      case "PUBLISHED":
        return "default";
      case "PENDING":
      case "PENDING_REVIEW":
        return "outline";
      case "REJECTED":
        return "destructive";
      default:
        return "secondary";
    }
  }

  const pendingCount = items.filter((item) => item.status === "PENDING" || item.status === "PENDING_REVIEW").length;
  const hasPendingSelected = items.some((item) => selectedIds.has(item.id) && (item.status === "PENDING" || item.status === "PENDING_REVIEW"));
  const hasNonPendingSelected = items.some((item) => selectedIds.has(item.id) && item.status !== "PENDING" && item.status !== "PENDING_REVIEW");

  const filters = [
    {
      key: "status",
      label: "All statuses",
      options: [
        { value: "PENDING", label: "Pending" },
        { value: "PENDING_REVIEW", label: "Pending Review" },
        { value: "ANALYZING", label: "Analyzing" },
        { value: "ANALYZED", label: "Analyzed" },
        { value: "PUBLISHED", label: "Published" },
        { value: "REJECTED", label: "Rejected" },
      ],
      value: statusFilter,
      onChange: setStatusFilter,
    },
    {
      key: "type",
      label: "All types",
      options: [
        { value: "signal", label: "Signals" },
        { value: "article", label: "Articles" },
      ],
      value: typeFilter,
      onChange: setTypeFilter,
    },
    {
      key: "sourceType",
      label: "All source types",
      options: [
        { value: "NEWS", label: "News" },
        { value: "FILING", label: "Filing" },
        { value: "TRANSCRIPT", label: "Transcript" },
        { value: "SOCIAL", label: "Social" },
        { value: "BLOG", label: "Blog" },
        { value: "JOB_POSTING", label: "Job Posting" },
      ],
      value: sourceTypeFilter,
      onChange: setSourceTypeFilter,
    },
    {
      key: "confidence",
      label: "All confidence",
      options: [
        { value: "0.8", label: "High (≥0.8)" },
        { value: "0.6", label: "Medium (≥0.6)" },
        { value: "0.4", label: "Low (≥0.4)" },
      ],
      value: confidenceFilter,
      onChange: setConfidenceFilter,
    },
    {
      key: "sentiment",
      label: "All sentiment",
      options: [
        { value: "POSITIVE", label: "Positive" },
        { value: "NEGATIVE", label: "Negative" },
        { value: "NEUTRAL", label: "Neutral" },
      ],
      value: sentimentFilter,
      onChange: setSentimentFilter,
    },
  ];

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Analysis Operations Moved</AlertTitle>
        <AlertDescription>
          Analysis and discovery operations are now in the{" "}
          <Link href="/dashboard/admin/control-center" className="underline font-medium">
            Control Center
          </Link>
        </AlertDescription>
      </Alert>

      <AdminPageHeader
        eyebrow="Content"
        title="All Content"
        count={items.length}
        description={pendingCount > 0 ? `${pendingCount} pending review` : undefined}
      />

      <AdminFilterBar filters={filters} />

      {selectedIds.size > 0 && (
        <Card className="border-2 border-foreground bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-2">
                {hasPendingSelected && (
                  <>
                    <Button onClick={handleBulkApprove} size="sm" disabled={isBulkApproving}>
                      {isBulkApproving ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving...</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 mr-2" />Approve Selected</>
                      )}
                    </Button>
                    <Button onClick={handleBulkReject} variant="destructive" size="sm" disabled={isBulkRejecting}>
                      {isBulkRejecting ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejecting...</>
                      ) : (
                        <><XCircle className="h-4 w-4 mr-2" />Reject Selected</>
                      )}
                    </Button>
                  </>
                )}
                {hasNonPendingSelected && (
                  <Button onClick={handleBulkDelete} variant="destructive" size="sm" disabled={isBulkDeleting}>
                    {isBulkDeleting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
                    ) : (
                      <><Trash2 className="h-4 w-4 mr-2" />Delete Selected</>
                    )}
                  </Button>
                )}
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
            <Button onClick={fetchData} variant="outline">Retry</Button>
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
                    checked={selectedIds.size === items.length && items.length > 0}
                    onCheckedChange={() => {
                      if (selectedIds.size === items.length) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(items.map((item) => item.id)));
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="min-w-[200px]">Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Source/Persona</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Sentiment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && items.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                items.map((item) => {
                  const isPending = item.status === "PENDING" || item.status === "PENDING_REVIEW";
                  const isBusy = isApproving === item.id || isRejecting === item.id;
                  return (
                    <TableRow key={`${item.type}-${item.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            setSelectedIds(next);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.type === "signal" ? "default" : "secondary"}>
                          {item.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium min-w-0 max-w-[300px] truncate">
                        {item.title}
                      </TableCell>
                      <TableCell className="min-w-0 max-w-[200px] truncate">
                        {item.companyName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.sourceType || item.agentPersona || "—"}
                      </TableCell>
                      <TableCell>
                        {item.clusterLabel ? (
                          <Badge variant="secondary" className="text-xs">
                            {item.clusterLabel}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(item.status)}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.confidence ? (
                          <Badge variant="outline">{(item.confidence * 100).toFixed(0)}%</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {item.sentiment ? (
                          <Badge variant={item.sentiment === "POSITIVE" ? "default" : item.sentiment === "NEGATIVE" ? "destructive" : "outline"}>
                            {item.sentiment}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(item)} disabled={isBusy}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isPending ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleApprove(item.id, item.type)} disabled={isBusy}>
                                {isApproving === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                )}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setRejectDialog({ open: true, itemId: item.id, itemType: item.type })} disabled={isBusy}>
                                {isRejecting === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteDialog({ open: true, item })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && items.length === 0 && !error && (
          <AdminEmptyState
            icon={FileText}
            title="No content found"
            description="Try adjusting your filters"
          />
        )}
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.title}</DialogTitle>
            <DialogDescription>
              {previewItem?.companyName} • {previewItem?.sourceType || previewItem?.agentPersona}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewItem?.clusterLabel && (
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-2">Cluster</p>
                <Badge variant="secondary">{previewItem.clusterLabel}</Badge>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-2">Summary</p>
              <p className="text-sm">{previewItem?.summary || "No summary available"}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">Confidence</p>
                <p className="text-sm font-medium">{previewItem?.confidence ? `${(previewItem.confidence * 100).toFixed(0)}%` : "N/A"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">Sentiment</p>
                <p className="text-sm font-medium">{previewItem?.sentiment || "N/A"}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewItem(null)}>Close</Button>
            {(previewItem?.status === "PENDING" || previewItem?.status === "PENDING_REVIEW") && (
              <>
                <Button onClick={() => { if (previewItem) { handleApprove(previewItem.id, previewItem.type); setPreviewItem(null); } }}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />Approve
                </Button>
                <Button variant="destructive" onClick={() => { if (previewItem) { setRejectDialog({ open: true, itemId: previewItem.id, itemType: previewItem.type }); setPreviewItem(null); } }}>
                  <XCircle className="h-4 w-4 mr-2" />Reject
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={() => setRejectDialog({ open: false, itemId: "", itemType: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Item</DialogTitle>
            <DialogDescription>Please provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g., Low quality content, duplicate signal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, itemId: "", itemType: "" })}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={() => setEditDialog({ open: false, item: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
            <DialogDescription>Update the title for this {editDialog.item?.type}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Enter title" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, item: null })} disabled={isEditing}>Cancel</Button>
            <Button onClick={handleEdit} disabled={isEditing}>
              {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={() => setDeleteDialog({ open: false, item: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Content</DialogTitle>
            <DialogDescription>Are you sure you want to delete this {deleteDialog.item?.type}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <p className="text-sm font-medium">{deleteDialog.item?.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{deleteDialog.item?.companyName}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, item: null })} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

