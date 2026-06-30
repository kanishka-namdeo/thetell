"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Coins, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentTokenUsage } from "@/lib/deepagent/types";

interface DeepAgentTokenDisplayProps {
  tokenUsage: DeepAgentTokenUsage;
  className?: string;
}

const COST_PER_1K_INPUT = 0.005;
const COST_PER_1K_OUTPUT = 0.015;

function estimateCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
  if (cost < 0.001) return "< $0.001";
  return `$${cost.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function DeepAgentTokenDisplay({ tokenUsage, className }: DeepAgentTokenDisplayProps) {
  const { inputTokens, outputTokens, totalTokens, cachedTokens } = tokenUsage;
  const hasCachedTokens = cachedTokens && cachedTokens > 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
            <Coins className="size-3" />
            <span className="tabular-nums">{formatTokens(totalTokens)} tokens</span>
            {hasCachedTokens && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] gap-0.5">
                <Zap className="size-2.5" />
                {formatTokens(cachedTokens)} cached
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Input:</span>
              <span className="tabular-nums">{formatTokens(inputTokens)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Output:</span>
              <span className="tabular-nums">{formatTokens(outputTokens)}</span>
            </div>
            {hasCachedTokens && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cached:</span>
                <span className="tabular-nums">{formatTokens(cachedTokens)}</span>
              </div>
            )}
            <div className="border-t border-border pt-1 flex justify-between gap-4">
              <span className="text-muted-foreground">Est. cost:</span>
              <span className="tabular-nums font-medium">{estimateCost(inputTokens, outputTokens)}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
