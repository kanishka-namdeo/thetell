"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import { Edit, Trash2, RefreshCw, FileText, AlertTriangle, Loader2 } from "lucide-react";

interface ContentItem {
  id: string;
  type: "signal" | "article";
  title: string;
  status: string;
  sourceType?: string;
  agentPersona?: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export default function ContentManagementPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "updatedAt");
  const [sortOrder, setSortOrder] = useState(searchParams.get("sortOrder") || "desc");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    item: ContentItem | null;
  }>({ open: false, item: null });
  const [editTitle, setEditTitle] = useState("");

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    item: ContentItem | null;
  }>({ open: false, item: null });

  const [reanalyzeDialog, setReanalyzeDialog] = useState<{
    open: boolean;
    item: ContentItem | null;
  }>({ open: false, item: null });
  const controllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  useEffect(() => {
    fetchContent();
    return () => controllerRef.current?.abort();
  }, [typeFilter, statusFilter, sortBy, sortOrder]);

  async function fetchContent(cursor?: string) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (cursor) params.set("cursor", cursor);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("limit", "50");

      const response = await fetch(`/api/v1/admin/content?${params}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error("Failed to fetch content");
      }

      const data = await response.json();
      if (cursor) {
        setItems((prev) => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to fetch content";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
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

      if (!response.ok) {
        throw new Error("Failed to update content");
      }

      setItems(
        items.map((item) =>
          item.id === editDialog.item!.id ? { ...item, title: editTitle } : item
        )
      );

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

      if (!response.ok) {
        throw new Error("Failed to delete content");
      }

      setItems(items.filter((item) => item.id !== deleteDialog.item!.id));
      setDeleteDialog({ open: false, item: null });
      toast.success("Content deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReanalyze() {
    if (!reanalyzeDialog.item || reanalyzeDialog.item.type !== "signal") return;

    setIsReanalyzing(true);
    try {
      const response = await fetch(
        `/api/v1/admin/content/signals/${reanalyzeDialog.item.id}/reanalyze`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to reanalyze signal");
      }

      toast.success("Re-analysis started. This may take 10-30 seconds.");
      setReanalyzeDialog({ open: false, item: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reanalyze";
      toast.error(message);
    } finally {
      setIsReanalyzing(false);
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

  return (
    <div className="space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Content
        </p>
        <h1 className="text-3xl font-serif font-bold">Library</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          {total} total items
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[140px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All types</SelectItem>
                <SelectItem value="signal">Signals</SelectItem>
                <SelectItem value="article">Articles</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v || "")}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ANALYZING">Analyzing</SelectItem>
                <SelectItem value="ANALYZED">Analyzed</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={`${sortBy}-${sortOrder}`}
              onValueChange={(value) => {
                if (!value) return;
                const [by, order] = value.split("-");
                setSortBy(by);
                setSortOrder(order);
              }}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAt-desc">Recently updated</SelectItem>
                <SelectItem value="updatedAt-asc">Oldest updated</SelectItem>
                <SelectItem value="createdAt-desc">Newest first</SelectItem>
                <SelectItem value="createdAt-asc">Oldest first</SelectItem>
                <SelectItem value="publishedAt-desc">Recently published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{error}</p>
            <Button onClick={() => fetchContent()} variant="outline">
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
              <TableHead>Type</TableHead>
              <TableHead className="min-w-[200px]">Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source/Persona</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && items.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
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
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
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
                    <Badge variant={item.type === "signal" ? "default" : "secondary"}>
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium min-w-0 max-w-[300px] truncate">
                    {item.title}
                  </TableCell>
                  <TableCell className="min-w-0 max-w-[200px] truncate">{item.companyName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {item.sourceType || item.agentPersona || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(item.status)}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(item.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {item.type === "signal" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReanalyzeDialog({ open: true, item })}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteDialog({ open: true, item })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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
              onClick={() => fetchContent(nextCursor!)}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}

        {!isLoading && items.length === 0 && !error && (
          <AdminEmptyState
            icon={FileText}
            title="No content found"
            description="Try adjusting your filters"
          />
        )}
      </Card>

      <Dialog
        open={editDialog.open}
        onOpenChange={() => setEditDialog({ open: false, item: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
            <DialogDescription>
              Update the title for this {editDialog.item?.type}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Enter title"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialog({ open: false, item: null })}
              disabled={isEditing}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isEditing}>
              {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={() => setDeleteDialog({ open: false, item: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Content</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteDialog.item?.type}? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <p className="text-sm font-medium">{deleteDialog.item?.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {deleteDialog.item?.companyName}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, item: null })}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reanalyzeDialog.open}
        onOpenChange={() => setReanalyzeDialog({ open: false, item: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-analyze Signal</DialogTitle>
            <DialogDescription>
              This will trigger a new AI analysis on the signal. The existing analysis will
              be replaced. This may take 10-30 seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3">
            <p className="text-sm font-medium">{reanalyzeDialog.item?.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {reanalyzeDialog.item?.companyName}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReanalyzeDialog({ open: false, item: null })}
              disabled={isReanalyzing}
            >
              Cancel
            </Button>
            <Button onClick={handleReanalyze} disabled={isReanalyzing}>
              {isReanalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start Re-analysis
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
