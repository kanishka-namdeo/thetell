"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getConfidenceBand } from "@/lib/utils/confidence";

interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);
  const band = getConfidenceBand(confidence);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            className={cn(
              "font-mono cursor-help w-fit",
              band.color,
              band.bgColor,
              className
            )}
          >
            {band.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <span className="font-mono">
            {percentage}% confidence — {band.description}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
