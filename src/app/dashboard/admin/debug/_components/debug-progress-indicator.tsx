"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Search,
  FlaskConical,
  Code2,
  FileEdit,
  CheckCircle2,
} from "lucide-react";
import type { DebugEvent } from "@/lib/debug/event-types";

interface DebugProgressIndicatorProps {
  events: DebugEvent[];
  isRunning: boolean;
}

type AgentPhase = "investigating" | "analyzing" | "formulating" | "applying";

const PHASES: { key: AgentPhase; label: string; icon: typeof Search }[] = [
  { key: "investigating", label: "Investigating", icon: Search },
  { key: "analyzing", label: "Analyzing", icon: FlaskConical },
  { key: "formulating", label: "Formulating fix", icon: Code2 },
  { key: "applying", label: "Applying fix", icon: FileEdit },
];

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "prisma", "query", "find"]);
const SHELL_TOOLS = new Set(["Shell", "exec", "bash", "run", "terminal"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "StrReplace", "patch"]);

function classifyTool(tool: string): AgentPhase | null {
  const lower = tool.toLowerCase();
  if ([...READ_TOOLS].some((t) => lower.includes(t.toLowerCase()))) return "investigating";
  if ([...SHELL_TOOLS].some((t) => lower.includes(t.toLowerCase()))) return "analyzing";
  if ([...WRITE_TOOLS].some((t) => lower.includes(t.toLowerCase()))) return "applying";
  return null;
}

function detectPhase(events: DebugEvent[]): AgentPhase | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];

    if (e.type === "tool_use" && e.tool) {
      const phase = classifyTool(e.tool);
      if (phase) return phase;
    }

    if (e.type === "text" && e.content) {
      const content = e.content.toLowerCase();
      if (
        content.includes("fix") ||
        content.includes("change") ||
        content.includes("update") ||
        content.includes("modify")
      ) {
        return "formulating";
      }
      if (
        content.includes("analyz") ||
        content.includes("check") ||
        content.includes("run") ||
        content.includes("investigat")
      ) {
        return "analyzing";
      }
    }
  }
  return null;
}

function getCompletedPhases(events: DebugEvent[]): Set<AgentPhase> {
  const completed = new Set<AgentPhase>();
  const seen = new Set<AgentPhase>();

  for (const e of events) {
    if (e.type === "tool_use" && e.tool) {
      const phase = classifyTool(e.tool);
      if (phase) seen.add(phase);
    }
  }

  const phaseOrder: AgentPhase[] = ["investigating", "analyzing", "formulating", "applying"];
  for (const p of phaseOrder) {
    if (seen.has(p)) {
      completed.add(p);
    } else {
      break;
    }
  }

  return completed;
}

export function DebugProgressIndicator({
  events,
  isRunning,
}: DebugProgressIndicatorProps) {
  const currentPhase = useMemo(() => detectPhase(events), [events]);
  const completedPhases = useMemo(() => getCompletedPhases(events), [events]);
  const isComplete = !isRunning && events.length > 0;

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase, idx) => {
        const Icon = phase.icon;
        const isCurrent = currentPhase === phase.key && isRunning;
        const isDone = completedPhases.has(phase.key) && !isCurrent;
        const isFullyDone = isComplete && completedPhases.has(phase.key);

        return (
          <div key={phase.key} className="flex items-center gap-1 flex-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors flex-1 justify-center",
                isCurrent && "bg-primary/10 text-primary",
                isDone && !isFullyDone && "bg-muted text-muted-foreground",
                isFullyDone && "bg-success/10 text-success",
                !isCurrent && !isDone && "text-muted-foreground/50"
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isCurrent && "animate-pulse"
                )}
              />
              <span className="hidden sm:inline">{phase.label}</span>
            </div>
            {idx < PHASES.length - 1 && (
              <div
                className={cn(
                  "h-px w-2 shrink-0",
                  isDone || isFullyDone
                    ? "bg-success/40"
                    : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
      {isComplete && (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0 ml-1" />
      )}
    </div>
  );
}
