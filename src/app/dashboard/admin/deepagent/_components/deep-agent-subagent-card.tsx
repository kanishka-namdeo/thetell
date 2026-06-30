"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Bot, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DeepAgentToolCallCard } from "./deep-agent-tool-call-card";
import { DeepAgentMarkdownContent } from "./deep-agent-markdown-content";
import type { DeepAgentSubagentEvent, DeepAgentSubagentStatus } from "@/lib/deepagent/types";

interface DeepAgentSubagentCardProps {
  subagent: DeepAgentSubagentEvent;
  className?: string;
}

const statusConfig: Record<
  DeepAgentSubagentStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Bot; label: string }
> = {
  started: { variant: "secondary", icon: Loader2, label: "Started" },
  running: { variant: "default", icon: Loader2, label: "Running" },
  completed: { variant: "default", icon: CheckCircle2, label: "Completed" },
  failed: { variant: "destructive", icon: XCircle, label: "Failed" },
};

export function DeepAgentSubagentCard({ subagent, className }: DeepAgentSubagentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = statusConfig[subagent.status];
  const Icon = config.icon;
  const isRunning = subagent.status === "running" || subagent.status === "started";

  const lastAssistantMessage = [...subagent.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  return (
    <div
      className={cn(
        "border border-border/50 rounded-lg bg-muted/20 overflow-hidden",
        isRunning && "border-primary/30",
        className
      )}
    >
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">
          {subagent.name}
        </span>
        <Badge
          variant={config.variant}
          className={cn(
            "h-4 px-1.5 text-[10px] gap-1 ml-auto shrink-0",
            isRunning && "animate-pulse"
          )}
        >
          <Icon className={cn("size-2.5", isRunning && "animate-spin")} />
          {config.label}
        </Badge>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30">
          {/* Last assistant response preview */}
          {lastAssistantMessage && (
            <div className="mt-2 pl-5 border-l-2 border-primary/20">
              <DeepAgentMarkdownContent
                content={lastAssistantMessage.content}
                className="text-xs text-muted-foreground"
              />
            </div>
          )}

          {/* Nested tool calls */}
          {subagent.toolCalls.length > 0 && (
            <div className="space-y-2 pl-4">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Tool Calls
              </span>
              {subagent.toolCalls.map((toolCall) => (
                <DeepAgentToolCallCard
                  key={toolCall.id}
                  tool={toolCall.name}
                  input={toolCall.input}
                  output={toolCall.output}
                  success={toolCall.status === "completed"}
                  duration={toolCall.duration}
                  isResult={
                    toolCall.status === "completed" || toolCall.status === "error"
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
