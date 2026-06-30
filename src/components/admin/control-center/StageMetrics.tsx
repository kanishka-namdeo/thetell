"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useControlCenterMotion } from "./useMotion";

export interface MetricItem {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  highlight?: boolean;
}

interface StageMetricsProps {
  metrics: MetricItem[];
  className?: string;
}

export function StageMetrics({ metrics, className }: StageMetricsProps) {
  const { shouldAnimate, transitions } = useControlCenterMotion();

  if (metrics.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No metrics available
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={cn(
            "flex flex-col gap-1 rounded-md border border-border p-2",
            metric.highlight && "bg-accent/30"
          )}
        >
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {metric.label}
          </span>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              <motion.span
                key={`${metric.label}-${metric.value}`}
                initial={shouldAnimate ? { y: -10, opacity: 0 } : {}}
                animate={{ y: 0, opacity: 1 }}
                exit={shouldAnimate ? { y: 10, opacity: 0 } : {}}
                transition={transitions.fast}
                className="text-lg font-semibold text-foreground"
              >
                {metric.value}
              </motion.span>
            </AnimatePresence>
            {metric.trend && (
              <motion.div
                key={`${metric.label}-trend-${metric.trend}`}
                initial={shouldAnimate ? { scale: 0.8, opacity: 0 } : {}}
                animate={{ scale: 1, opacity: 1 }}
                transition={transitions.fast}
              >
                <Badge
                  variant={
                    metric.trend === "up"
                      ? "default"
                      : metric.trend === "down"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  {metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→"}
                </Badge>
              </motion.div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
