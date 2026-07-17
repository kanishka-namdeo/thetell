"use client";

import { useState, useEffect, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

interface PendingApproval {
  id: string;
  toolName: string;
  toolInput: unknown;
  status: string;
  createdAt: string;
}

interface DeepAgentBatchApprovalProps {
  sessionId: string | null;
  onApprovalsProcessed?: () => void;
}

function getToolDangerLevel(name: string): "high" | "medium" | "low" {
  if (name === "execute") return "high";
  if (name === "write_file" || name === "edit_file") return "medium";
  return "low";
}

function truncateInput(input: unknown, maxLength: number = 80): string {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function DeepAgentBatchApproval({
  sessionId,
  onApprovalsProcessed,
}: DeepAgentBatchApprovalProps) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingAction, setPendingAction] = useState<"approve" | "reject">("approve");

  const [refreshKey, setRefreshKey] = useState(0);

  const refreshApprovals = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const controller = new AbortController();

    const fetchApprovals = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/v1/admin/deepagent/approvals?sessionId=${encodeURIComponent(sessionId)}`,
          {
credentials: "include", signal: controller.signal }
        );
        if (response.ok) {
          const data = await response.json();
          setApprovals(data.data);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        logger.error("deepagent.batch_approval.load_error", { error: String(error) });
      } finally {
        setIsLoading(false);
      }
    };

    fetchApprovals();

    return () => controller.abort();
  }, [sessionId, refreshKey]);

  const handleSelectAll = () => {
    if (selectedIds.size === approvals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvals.map((a) => a.id)));
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleToggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const processBatchAction = async (action: "approve" | "reject", reason?: string) => {
    if (selectedIds.size === 0) {
      toast.error("No approvals selected");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/v1/admin/deepagent/approvals/batch", {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalIds: Array.from(selectedIds),
          action,
          reason,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          `${result.succeeded} approval${result.succeeded !== 1 ? "s" : ""} ${action === "approve" ? "approved" : "rejected"}`
        );
        setSelectedIds(new Set());
        setRejectReason("");
        refreshApprovals();
        onApprovalsProcessed?.();
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to process approvals");
      }
    } catch (error) {
      logger.error("deepagent.batch_approval.process_error", { error: String(error) });
      toast.error("Failed to process approvals");
    } finally {
      setIsProcessing(false);
      setShowApproveDialog(false);
      setShowRejectDialog(false);
    }
  };

  const handleApproveClick = () => {
    setPendingAction("approve");
    setShowApproveDialog(true);
  };

  const handleRejectClick = () => {
    setPendingAction("reject");
    setShowRejectDialog(true);
  };

  const handleConfirmAction = () => {
    if (pendingAction === "approve") {
      processBatchAction("approve");
    } else {
      processBatchAction("reject", rejectReason || undefined);
    }
  };

  if (!sessionId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading pending approvals...</div>
        </CardContent>
      </Card>
    );
  }

  if (approvals.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8" />
            <div className="text-sm">No pending approvals</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Header with select all/deselect all */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedIds.size === approvals.length && approvals.length > 0}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all approvals"
                />
                <label
                  htmlFor="select-all"
                  className="text-sm font-medium cursor-pointer"
                >
                  {selectedIds.size === approvals.length ? "Deselect All" : "Select All"}
                </label>
                <Badge variant="secondary" className="ml-2">
                  {selectedIds.size} / {approvals.length} selected
                </Badge>
              </div>
            </div>

            {/* Approval list */}
            <ScrollArea className="h-[400px] rounded-md border border-border">
              <div className="space-y-2 p-4">
                {approvals.map((approval) => {
                  const dangerLevel = getToolDangerLevel(approval.toolName);
                  const isSelected = selectedIds.has(approval.id);

                  return (
                    <div
                      key={approval.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleSelection(approval.id)}
                        aria-label={`Select approval ${approval.id}`}
                        className="mt-0.5"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              dangerLevel === "high"
                                ? "destructive"
                                : dangerLevel === "medium"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {dangerLevel === "high"
                              ? "High Risk"
                              : dangerLevel === "medium"
                              ? "Medium Risk"
                              : "Low Risk"}
                          </Badge>
                          <span className="text-sm font-mono font-medium">
                            {approval.toolName}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {truncateInput(approval.toolInput)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeAgo(approval.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Action buttons */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={handleDeselectAll}
                disabled={selectedIds.size === 0 || isProcessing}
              >
                Clear Selection
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={handleRejectClick}
                  disabled={selectedIds.size === 0 || isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Selected
                </Button>
                <Button
                  onClick={handleApproveClick}
                  disabled={selectedIds.size === 0 || isProcessing}
                  className="bg-success hover:bg-success/90"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Selected
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approve confirmation dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-success" />
              Confirm Batch Approval
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to approve {selectedIds.size} approval
              {selectedIds.size !== 1 ? "s" : ""}. This will allow the DeepAgent to execute
              these operations. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className="bg-success hover:bg-success/90"
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject confirmation dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Batch Rejection
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to reject {selectedIds.size} approval
              {selectedIds.size !== 1 ? "s" : ""}. This will prevent the DeepAgent from executing
              these operations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="reject-reason" className="text-sm font-medium">
              Reason (optional)
            </label>
            <Textarea
              id="reject-reason"
              placeholder="Enter reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className="bg-destructive hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
