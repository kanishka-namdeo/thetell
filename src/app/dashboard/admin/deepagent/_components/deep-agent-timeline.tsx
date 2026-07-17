"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History, GitBranch, RotateCcw, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface Checkpoint {
  checkpoint_id: string;
  timestamp: string;
  message_count: number;
  metadata: Record<string, unknown>;
}

interface DeepAgentTimelineProps {
  sessionId: string | null;
  onRestore?: (checkpointId: string) => void;
  onBranch?: (checkpointId: string) => void;
  className?: string;
}

export function DeepAgentTimeline({
  sessionId,
  onRestore,
  onBranch,
  className,
}: DeepAgentTimelineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [actionDialog, setActionDialog] = useState<"restore" | "branch" | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadCheckpoints = useCallback(async () => {
    if (!sessionId) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/deepagent/checkpoints?sessionId=${sessionId}`,
        {
credentials: "include", signal: controller.signal }
      );
      if (response.ok) {
        const data = await response.json();
        setCheckpoints(data.data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.checkpoints_load_failed", { sessionId, error: String(error) });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen && sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCheckpoints();
    }
    return () => controllerRef.current?.abort();
  }, [isOpen, sessionId, loadCheckpoints]);

  const handleRestore = async (checkpointId: string) => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `/api/v1/admin/deepagent/checkpoints/${checkpointId}?sessionId=${sessionId}`,
        {
credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restore" }),
        }
      );

      if (response.ok) {
        setActionDialog(null);
        setSelectedCheckpoint(null);
        setIsOpen(false);
        onRestore?.(checkpointId);
      }
    } catch (error) {
      logger.error("deepagent.checkpoint_restore_failed", { checkpointId, error: String(error) });
    }
  };

  const handleBranch = async (checkpointId: string) => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `/api/v1/admin/deepagent/checkpoints/${checkpointId}?sessionId=${sessionId}`,
        {
credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "branch" }),
        }
      );

      if (response.ok) {
        setActionDialog(null);
        setSelectedCheckpoint(null);
        setIsOpen(false);
        onBranch?.(checkpointId);
      }
    } catch (error) {
      logger.error("deepagent.checkpoint_branch_failed", { checkpointId, error: String(error) });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!sessionId) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={cn("h-8", className)}
        title="View conversation history"
      >
        <History className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">Timeline</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Conversation Timeline</DialogTitle>
            <DialogDescription>
              View and restore previous conversation states
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-sm text-muted-foreground">
                    Loading checkpoints...
                  </div>
                </div>
              ) : checkpoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <History className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    No checkpoints available
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Checkpoints are created as you chat
                  </div>
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  {checkpoints.map((checkpoint, index) => (
                    <Card
                      key={checkpoint.checkpoint_id}
                      className={cn(
                        "p-3 cursor-pointer transition-colors hover:bg-accent",
                        selectedCheckpoint?.checkpoint_id === checkpoint.checkpoint_id &&
                          "ring-2 ring-primary"
                      )}
                      onClick={() => setSelectedCheckpoint(checkpoint)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              #{checkpoints.length - index}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(checkpoint.timestamp)}
                            </span>
                          </div>
                          <div className="text-sm">
                            {checkpoint.message_count} message
                            {checkpoint.message_count !== 1 ? "s" : ""}
                          </div>
                          {typeof checkpoint.metadata?.source === "string" && checkpoint.metadata.source && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Source: {checkpoint.metadata.source}
                            </div>
                          )}
                        </div>
                        {selectedCheckpoint?.checkpoint_id ===
                          checkpoint.checkpoint_id && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionDialog("restore");
                              }}
                              className="h-7"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionDialog("branch");
                              }}
                              className="h-7"
                            >
                              <GitBranch className="h-3 w-3 mr-1" />
                              Branch
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={actionDialog === "restore"}
        onOpenChange={(open) => !open && setActionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Checkpoint?</DialogTitle>
            <DialogDescription>
              This will restore the conversation to this point. Any messages after
              this checkpoint will be hidden (not deleted). You can continue the
              conversation from this state.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedCheckpoint && handleRestore(selectedCheckpoint.checkpoint_id)
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Confirmation Dialog */}
      <Dialog
        open={actionDialog === "branch"}
        onOpenChange={(open) => !open && setActionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Branch Conversation?</DialogTitle>
            <DialogDescription>
              This will create a new conversation branch starting from this
              checkpoint. The original conversation will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedCheckpoint && handleBranch(selectedCheckpoint.checkpoint_id)
              }
            >
              <GitBranch className="h-4 w-4 mr-2" />
              Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
