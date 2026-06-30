"use client";

import { useState } from "react";
import { Circle, Loader2, CheckCircle2, ChevronDown, ChevronRight, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeepAgentTaskEvent, DeepAgentTaskStatus } from "@/lib/deepagent/types";

interface DeepAgentTaskListProps {
  tasks: DeepAgentTaskEvent[];
  className?: string;
}

const statusConfig: Record<
  DeepAgentTaskStatus,
  { icon: typeof Circle; color: string; label: string }
> = {
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    label: "Pending",
  },
  in_progress: {
    icon: Loader2,
    color: "text-warning",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-success",
    label: "Completed",
  },
};

export function DeepAgentTaskList({ tasks, className }: DeepAgentTaskListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const total = tasks.length;

  return (
    <div
      className={cn(
        "border border-border/50 rounded-lg bg-card overflow-hidden",
        className
      )}
    >
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <ListTodo className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground">
          Task Plan
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {inProgressCount > 0 && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 text-[10px] gap-1 bg-warning/10 text-warning border-warning/20"
            >
              <Loader2 className="size-2.5 animate-spin" />
              {inProgressCount}
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="h-4 px-1.5 text-[10px] text-muted-foreground"
          >
            {completedCount}/{total}
          </Badge>
        </div>
      </button>

      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-1">
          {tasks.map((task) => {
            const config = statusConfig[task.status];
            const Icon = config.icon;

            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-start gap-2 py-1.5 px-2 rounded-md text-sm",
                  task.status === "completed" && "opacity-60"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 mt-0.5 shrink-0",
                    config.color,
                    task.status === "in_progress" && "animate-spin"
                  )}
                />
                <span
                  className={cn(
                    "text-xs leading-relaxed",
                    task.status === "completed" &&
                      "line-through text-muted-foreground",
                    task.status === "in_progress" && "text-foreground font-medium"
                  )}
                >
                  {task.content}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
