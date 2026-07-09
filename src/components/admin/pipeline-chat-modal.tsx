"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PipelineChat } from "@/components/admin/pipeline-chat";
import type { DiscoveredSource } from "@/hooks/use-pipeline-stream";
import { logger } from "@/lib/logger";

interface PipelineChatModalProps {
  companyId?: string;
  trigger?: React.ReactNode;
  onApply?: (result: { success: boolean; applied: number; errors: string[] }) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PipelineChatModal({
  companyId,
  trigger,
  onApply,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: PipelineChatModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleApply = async (sources: DiscoveredSource[], sessionId: string | null) => {
    if (!sessionId) {
      setApplyResult({
        success: false,
        message: "No session ID available. Please try again.",
      });
      return;
    }

    setIsApplying(true);
    try {
      const response = await fetch("/api/v1/admin/pipelines/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, companyId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to apply sources");
      }

      setApplyResult({
        success: true,
        message: `Successfully applied ${result.applied || sources.length} data sources to the company.`,
      });

      onApply?.(result);

      // Close modal after short delay to show success message
      closeTimeoutRef.current = setTimeout(() => {
        setOpen(false);
        setApplyResult(null);
      }, 2000);
    } catch (error) {
      logger.error("pipeline.apply.failed", { companyId, sessionId, error: String(error) });
      setApplyResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to apply sources",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    setOpen(false);
    setApplyResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        setApplyResult(null);
      }
    }}>
      {controlledOpen === undefined && (
        <DialogTrigger>
          {trigger || (
            <Button size="sm" variant="outline">
              <MessageSquare className="h-3 w-3 mr-1" />
              Pipeline Orchestrator
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pipeline Orchestrator</DialogTitle>
        </DialogHeader>

        {/* Success/Error Message */}
        {applyResult && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg ${
              applyResult.success
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {applyResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="text-sm">{applyResult.message}</span>
          </div>
        )}

        <PipelineChat
          companyId={companyId}
          onApply={handleApply}
          onClose={handleClose}
        />

        {isApplying && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Applying sources...
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
