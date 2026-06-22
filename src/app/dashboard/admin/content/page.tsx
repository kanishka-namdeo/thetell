"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { AdminEmptyState } from "@/components/admin/states";
import { CheckCircle2, XCircle, Eye, Filter, Inbox, AlertTriangle, Loader2 } from "lucide-react";

interface ModerationItem {
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
  summary?: string;
}

interface SignalApiItem {
  id: string;
  title: string;
  status: string;
  sourceType?: string;
  company: { name: string };
  analyses?: Array<{
    confidence?: number;
    sentiment?: string;
    summary?: string;
  }>;
  createdAt: string;
}

interface ArticleApiItem {
  id: string;
  title: string;
  status: string;
  agentPersona?: string;
  company: { name: string };
  createdAt: string;
  summary?: string;
}

export default function ModerationQueuePage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<ModerationItem | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    itemId: string;
    itemType: string;
  }>({ open: false, itemId: "", itemType: "" });
  const [rejectReason, setRejectReason] = useState("");
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

  const fetchQueue = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceTypeFilter) params.set("sourceType", sourceTypeFilter);
      if (confidenceFilter) params.set("confidence", confidenceFilter);
      if (sentimentFilter) params.set("sentiment", sentimentFilter);
      params.set("limit", "50");

      const [signalsRes, articlesRes] = await Promise.all([
        fetch(`/api/v1/admin/moderation/signals?${params}`, { signal: controller.signal }),
        fetch(`/api/v1/admin/moderation/articles?${params}`, { signal: controller.signal }),
      ]);

      if (!signalsRes.ok || !articlesRes.ok) {
        throw new Error("Failed to fetch queue");
      }

      const signalsData = await signalsRes.json();
      const articlesData = await articlesRes.json();

      const combinedItems: ModerationItem[] = [
        ...signalsData.items.map((s: SignalApiItem) => ({
          id: s.id,
          type: "signal" as const,
          title: s.title,
          status: s.status,
          sourceType: s.sourceType,
          companyName: s.company.name,
          confidence: s.analyses?.[0]?.confidence,
          sentiment: s.analyses?.[0]?.sentiment,
          createdAt: s.createdAt,
          summary: s.analyses?.[0]?.summary,
        })),
        ...articlesData.items.map((a: ArticleApiItem) => ({
          id: a.id,
          type: "article" as const,
          title: a.title,
          status: a.status,
          agentPersona: a.agentPersona,
          companyName: a.company.name,
          createdAt: a.createdAt,
          summary: a.summary,
        })),
      ];

      combinedItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setItems(combinedItems);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to fetch queue";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [sourceTypeFilter, confidenceFilter, sentimentFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue();
    return () => controllerRef.current?.abort();
  }, [fetchQueue]);

  async function handleApprove(itemId: string, itemType: string) {
    setIsApproving(itemId);
    try {
      const endpoint =
        itemType === "signal"
          ? `/api/v1/admin/moderation/signals/${itemId}/approve`
          : `/api/v1/admin/moderation/articles/${itemId}/approve`;

      const response = await fetch(endpoint, { method: "POST" });

      if (!response.ok) {
        throw new Error("Failed to approve item");
      }

      setItems(items.filter((item) => item.id !== itemId));
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
          ? `/api/v1/admin/moderation/signals/${rejectDialog.itemId}/reject`
          : `/api/v1/admin/moderation/articles/${rejectDialog.itemId}/reject`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (!response.ok) {
        throw new Error("Failed to reject item");
      }

      setItems(items.filter((item) => item.id !== rejectDialog.itemId));
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

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;

    setIsBulkApproving(true);
    try {
      const response = await fetch(
        `/api/v1/admin/moderation/bulk?action=approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to bulk approve");
      }

      setItems(items.filter((item) => !selectedIds.has(item.id)));
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
      const response = await fetch(
        `/api/v1/admin/moderation/bulk?action=reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selectedIds), reason }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to bulk reject");
      }

      setItems(items.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} item${selectedIds.size > 1 ? "s" : ""} rejected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to bulk reject";
      toast.error(message);
    } finally {
      setIsBulkRejecting(false);
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
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Content
        </p>
        <h1 className="text-3xl font-serif font-bold">Review Queue</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          {items.length} items pending review
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select
                value={sourceTypeFilter}
                onValueChange={(v) => setSourceTypeFilter(v || "")}
              >
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                  <SelectValue placeholder="All source types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All source types</SelectItem>
                  <SelectItem value="NEWS">News</SelectItem>
                  <SelectItem value="FILING">Filing</SelectItem>
                  <SelectItem value="TRANSCRIPT">Transcript</SelectItem>
                  <SelectItem value="SOCIAL">Social</SelectItem>
                  <SelectItem value="BLOG">Blog</SelectItem>
                  <SelectItem value="JOB_POSTING">Job Posting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select
              value={confidenceFilter}
              onValueChange={(v) => setConfidenceFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="All confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All confidence</SelectItem>
                <SelectItem value="0.8">High (≥0.8)</SelectItem>
                <SelectItem value="0.6">Medium (≥0.6)</SelectItem>
                <SelectItem value="0.4">Low (≥0.4)</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sentimentFilter}
              onValueChange={(v) => setSentimentFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[140px]">
                <SelectValue placeholder="All sentiment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All sentiment</SelectItem>
                <SelectItem value="POSITIVE">Positive</SelectItem>
                <SelectItem value="NEGATIVE">Negative</SelectItem>
                <SelectItem value="NEUTRAL">Neutral</SelectItem>
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
                {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-2">
                <Button onClick={handleBulkApprove} size="sm" disabled={isBulkApproving}>
                  {isBulkApproving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve Selected
                    </>
                  )}
                </Button>
                <Button onClick={handleBulkReject} variant="destructive" size="sm" disabled={isBulkRejecting}>
                  {isBulkRejecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Selected
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
            <Button onClick={fetchQueue} variant="outline">
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
                  checked={selectedIds.size === items.length && items.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="min-w-[200px]">Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source/Persona</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && items.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-24 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              items.map((item) => (
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
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
                    {item.confidence ? (
                      <Badge variant="outline">
                        {(item.confidence * 100).toFixed(0)}%
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {item.sentiment ? (
                      <Badge
                        variant={
                          item.sentiment === "POSITIVE"
                            ? "default"
                            : item.sentiment === "NEGATIVE"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {item.sentiment}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewItem(item)}
                        disabled={isApproving === item.id || isRejecting === item.id}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleApprove(item.id, item.type)}
                        disabled={isApproving === item.id || isRejecting === item.id}
                      >
                        {isApproving === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRejectDialog({
                            open: true,
                            itemId: item.id,
                            itemType: item.type,
                          })
                        }
                        disabled={isApproving === item.id || isRejecting === item.id}
                      >
                        {isRejecting === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>

        {!isLoading && items.length === 0 && !error && (
          <AdminEmptyState
            icon={Inbox}
            title="No items in queue"
            description="Content awaiting moderation will appear here"
          />
        )}
      </Card>

      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.title}</DialogTitle>
            <DialogDescription>
              {previewItem?.companyName} •{" "}
              {previewItem?.sourceType || previewItem?.agentPersona}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-2">
                Summary
              </p>
              <p className="text-sm">{previewItem?.summary || "No summary available"}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                  Confidence
                </p>
                <p className="text-sm font-medium">
                  {previewItem?.confidence
                    ? `${(previewItem.confidence * 100).toFixed(0)}%`
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                  Sentiment
                </p>
                <p className="text-sm font-medium">{previewItem?.sentiment || "N/A"}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewItem(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (previewItem) {
                  handleApprove(previewItem.id, previewItem.type);
                  setPreviewItem(null);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (previewItem) {
                  setRejectDialog({
                    open: true,
                    itemId: previewItem.id,
                    itemType: previewItem.type,
                  });
                  setPreviewItem(null);
                }
              }}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectDialog.open}
        onOpenChange={() => setRejectDialog({ open: false, itemId: "", itemType: "" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Item</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection. This will be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Low quality content, duplicate signal, incorrect classification"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, itemId: "", itemType: "" })}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
