"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FileCode, Plus, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentFileChange } from "@/lib/deepagent/types";

interface DeepAgentFileChangeCardProps {
  change: DeepAgentFileChange;
}

function getChangeTypeColor(type: string) {
  switch (type) {
    case "created":
      return "bg-success text-success-foreground";
    case "deleted":
      return "bg-destructive text-destructive-foreground";
    case "modified":
      return "bg-info text-info-foreground";
    default:
      return "bg-muted";
  }
}

export function DeepAgentFileChangeCard({ change }: DeepAgentFileChangeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-border/50 bg-muted/20 overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-1.5 sm:gap-2 w-full px-2 sm:px-3 py-1.5 sm:py-2 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs sm:text-sm font-mono truncate flex-1 min-w-0">{change.path}</span>
        <Badge className={cn("text-[10px] h-5 px-1 shrink-0", getChangeTypeColor(change.type))}>
          {change.type}
        </Badge>
        {change.additions !== undefined && change.additions > 0 && (
          <span className="hidden sm:flex items-center gap-0.5 text-xs text-success shrink-0">
            <Plus className="h-3 w-3" />
            {change.additions}
          </span>
        )}
        {change.deletions !== undefined && change.deletions > 0 && (
          <span className="hidden sm:flex items-center gap-0.5 text-xs text-destructive shrink-0">
            <Minus className="h-3 w-3" />
            {change.deletions}
          </span>
        )}
      </button>

      {isExpanded && change.diff && (
        <div className="border-t border-border/50 bg-background">
          <pre className="p-2 sm:p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words max-h-[300px] sm:max-h-[400px] overflow-y-auto">
            {change.diff}
          </pre>
        </div>
      )}
    </div>
  );
}
