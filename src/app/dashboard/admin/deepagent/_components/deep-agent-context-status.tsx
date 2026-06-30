"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentCompressionEvent } from "@/lib/deepagent/types";

interface DeepAgentContextStatusProps {
  compressionEvents: DeepAgentCompressionEvent[];
  className?: string;
}

function formatTokensSaved(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DeepAgentContextStatus({
  compressionEvents,
  className,
}: DeepAgentContextStatusProps) {
  if (compressionEvents.length === 0) return null;

  const lastEvent = compressionEvents[compressionEvents.length - 1];
  const totalSaved = compressionEvents.reduce((sum, e) => sum + e.tokensSaved, 0);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="secondary"
            className={cn(
              "h-5 px-1.5 text-[10px] gap-1 cursor-default",
              "bg-info/10 text-info border-info/20",
              className
            )}
          >
            <Info className="size-2.5" />
            {compressionEvents.length === 1
              ? lastEvent.type
              : `${compressionEvents.length} compressions`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Context Compression</p>
            <p className="text-[10px] text-muted-foreground">
              Total saved: {formatTokensSaved(totalSaved)} tokens
            </p>
            {compressionEvents.length > 1 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {compressionEvents.map((event, idx) => (
                  <div
                    key={idx}
                    className="text-[10px] text-muted-foreground flex items-center gap-1"
                  >
                    <span className="font-medium">{event.type}</span>
                    <span>-</span>
                    <span>{formatTokensSaved(event.tokensSaved)} tokens</span>
                    <span className="ml-auto">{formatTimestamp(event.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
            {compressionEvents.length === 1 && (
              <p className="text-[10px] text-muted-foreground">
                {lastEvent.trigger} at {formatTimestamp(lastEvent.timestamp)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
