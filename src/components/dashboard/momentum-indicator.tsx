"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Zap, CheckCircle2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MomentumStatus = "EMERGING" | "ACCELERATING" | "PEAKED" | "FADING" | "RESOLVED";

interface MomentumIndicatorProps {
  momentum: number;
  status: MomentumStatus | string;
  signalCount: number;
  className?: string;
  showLabel?: boolean;
}

const statusConfig: Record<
  MomentumStatus,
  {
    icon: typeof TrendingUp;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  EMERGING: {
    icon: Minus,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
    label: "Emerging",
  },
  ACCELERATING: {
    icon: TrendingUp,
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success",
    label: "Accelerating",
  },
  PEAKED: {
    icon: Zap,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning",
    label: "Peaked",
  },
  FADING: {
    icon: TrendingDown,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive",
    label: "Fading",
  },
  RESOLVED: {
    icon: CheckCircle2,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
    label: "Resolved",
  },
};

export function MomentumIndicator({
  momentum,
  status,
  signalCount,
  className,
  showLabel = true,
}: MomentumIndicatorProps) {
  const config = statusConfig[status as MomentumStatus] ?? statusConfig.EMERGING;
  const { icon: Icon, color, bgColor, borderColor, label } = config;
  const momentumPercent = Math.round(momentum * 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 border font-mono text-xs uppercase tracking-wider cursor-help",
              bgColor,
              borderColor,
              color,
              className
            )}
          >
            <Icon className="h-3 w-3" />
            {showLabel && <span>{label}</span>}
            {showLabel && (
              <span className="text-[10px] opacity-70">
                ({signalCount} signal{signalCount !== 1 ? "s" : ""})
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="font-mono text-xs space-y-1">
            <p>
              Momentum: {momentumPercent}%
            </p>
            <p>
              Signals: {signalCount}
            </p>
            <p>
              Status: {label}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
