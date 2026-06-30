"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeepAgentStreamingIndicatorProps {
  isStreaming: boolean;
  currentTool?: string;
  className?: string;
}

export function DeepAgentStreamingIndicator({
  isStreaming,
  currentTool,
  className,
}: DeepAgentStreamingIndicatorProps) {
  if (!isStreaming) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground",
        className
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{currentTool ? `Running ${currentTool}...` : "Processing..."}</span>
    </div>
  );
}
