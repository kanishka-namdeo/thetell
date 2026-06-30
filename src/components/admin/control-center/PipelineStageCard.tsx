"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { StageMetrics, type MetricItem } from "./StageMetrics";
import { TriggerButton } from "./TriggerButton";
import { useControlCenterMotion } from "./useMotion";

export type StageStatus = "idle" | "running" | "recent" | "error";

interface PipelineStageCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  status: StageStatus;
  lastRun: string | null;
  metrics: MetricItem[];
  triggerLabel: string;
  triggerConfirmation: string;
  onTrigger: () => Promise<void>;
  secondaryTrigger?: {
    label: string;
    confirmation: string;
  };
  onSecondaryTrigger?: () => Promise<void>;
  isTriggering?: boolean;
  className?: string;
}

const statusConfig: Record<
  StageStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; dotClass: string }
> = {
  idle: {
    label: "Idle",
    variant: "secondary",
    dotClass: "bg-muted-foreground",
  },
  running: {
    label: "Running",
    variant: "default",
    dotClass: "bg-success",
  },
  recent: {
    label: "Recent",
    variant: "outline",
    dotClass: "bg-warning",
  },
  error: {
    label: "Error",
    variant: "destructive",
    dotClass: "bg-destructive",
  },
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function PipelineStageCard({
  name,
  description,
  icon: Icon,
  status,
  lastRun,
  metrics,
  triggerLabel,
  triggerConfirmation,
  onTrigger,
  secondaryTrigger,
  onSecondaryTrigger,
  isTriggering = false,
  className,
}: PipelineStageCardProps) {
  const statusInfo = statusConfig[status] ?? statusConfig.idle;
  const { shouldAnimate, transitions } = useControlCenterMotion();

  return (
    <motion.div
      whileHover={shouldAnimate ? { scale: 1.01 } : {}}
      transition={transitions.fast}
    >
      <Card
        className={cn(
          "flex flex-col border-2 border-foreground transition-all hover:shadow-lg hover:border-foreground/80",
          status === "running" && "border-success/50 shadow-success/20 shadow-md",
          status === "error" && "border-destructive/50",
          className
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <motion.div
                animate={status === "running" && shouldAnimate ? {
                  scale: [1, 1.05, 1],
                } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="flex size-10 items-center justify-center rounded-md bg-muted border border-border"
              >
                <Icon className="size-5 text-foreground" />
              </motion.div>
              <div>
                <h3 className="font-serif text-lg font-bold leading-tight">
                  {name}
                </h3>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <motion.div
              key={status}
              initial={shouldAnimate ? { scale: 0.8, opacity: 0 } : {}}
              animate={{ scale: 1, opacity: 1 }}
              transition={transitions.fast}
            >
              <Badge variant={statusInfo.variant} className="gap-1.5">
                <motion.span
                  className={cn("size-2 rounded-full", statusInfo.dotClass)}
                  animate={status === "running" && shouldAnimate ? {
                    opacity: [1, 0.5, 1],
                    scale: [1, 1.2, 1],
                  } : {}}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                />
                {statusInfo.label}
              </Badge>
            </motion.div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Last run:</span>{" "}
            {formatRelativeTime(lastRun)}
          </div>

          <StageMetrics metrics={metrics} />

          <div className="mt-auto pt-2 border-t border-border flex flex-col gap-2">
            <TriggerButton
              stageName={name}
              triggerLabel={triggerLabel}
              confirmationMessage={triggerConfirmation}
              onTrigger={onTrigger}
              disabled={isTriggering}
            />
            {secondaryTrigger && onSecondaryTrigger && (
              <TriggerButton
                stageName={name}
                triggerLabel={secondaryTrigger.label}
                confirmationMessage={secondaryTrigger.confirmation}
                onTrigger={onSecondaryTrigger}
                disabled={isTriggering}
                variant="ghost"
              />
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
