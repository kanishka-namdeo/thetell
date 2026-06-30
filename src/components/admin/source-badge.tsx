"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";

interface SourceBadgeProps {
  url: string;
  sourceType: string;
  label?: string;
  verified?: boolean;
  priority?: number;
}

export function SourceBadge({ url, sourceType, label, verified, priority }: SourceBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-card text-sm">
      {verified !== undefined && (
        verified ? (
          <CheckCircle className="h-3 w-3 text-success" />
        ) : (
          <XCircle className="h-3 w-3 text-muted-foreground" />
        )
      )}
      <span className="max-w-[150px] truncate" title={label || url}>
        {label || new URL(url).hostname}
      </span>
      <Badge variant="outline" className="text-[10px] h-5 shrink-0">
        {sourceType}
      </Badge>
      {priority !== undefined && priority <= 3 && (
        <Badge variant="default" className="text-[10px] h-5 shrink-0">
          P{priority}
        </Badge>
      )}
    </div>
  );
}
