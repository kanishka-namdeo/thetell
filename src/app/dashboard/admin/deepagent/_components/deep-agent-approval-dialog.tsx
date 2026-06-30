"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, X } from "lucide-react";
import type { DeepAgentApproval } from "@/lib/deepagent/types";

interface DeepAgentApprovalDialogProps {
  approval: DeepAgentApproval | null;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  isProcessing?: boolean;
}

export function DeepAgentApprovalDialog({
  approval,
  onApprove,
  onReject,
  isProcessing = false,
}: DeepAgentApprovalDialogProps) {
  const open = approval !== null && approval.status === "pending";

  if (!approval) return null;

  const toolName = approval.toolName;
  const toolInput = approval.toolInput as Record<string, unknown>;

  // Determine danger level based on tool type
  const getToolDangerLevel = (name: string): "high" | "medium" | "low" => {
    if (name === "execute") return "high";
    if (name === "write_file" || name === "edit_file") return "medium";
    return "low";
  };

  const dangerLevel = getToolDangerLevel(toolName);

  const getToolDescription = (name: string, input: Record<string, unknown>): string => {
    switch (name) {
      case "execute":
        return `Execute shell command: ${input.command || "unknown"}`;
      case "write_file":
        return `Create file: ${input.path || input.file_path || "unknown"}`;
      case "edit_file":
        return `Edit file: ${input.path || input.file_path || "unknown"}`;
      default:
        return `${name}`;
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Approval Required
          </DialogTitle>
          <DialogDescription>
            DeepAgent wants to perform a potentially dangerous operation. Review the details below and approve or reject.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Operation</div>
            <div className="flex items-center gap-2">
              <Badge variant={dangerLevel === "high" ? "destructive" : dangerLevel === "medium" ? "default" : "secondary"}>
                {dangerLevel === "high" ? "High Risk" : dangerLevel === "medium" ? "Medium Risk" : "Low Risk"}
              </Badge>
              <span className="text-sm font-mono">{toolName}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Description</div>
            <div className="text-sm">{getToolDescription(toolName, toolInput)}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Input</div>
            <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-64">
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onReject(approval.id)}
            disabled={isProcessing}
          >
            <X className="h-4 w-4 mr-2" />
            Reject
          </Button>
          <Button
            onClick={() => onApprove(approval.id)}
            disabled={isProcessing}
          >
            <Check className="h-4 w-4 mr-2" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
