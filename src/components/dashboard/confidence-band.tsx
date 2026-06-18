"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

type ConfidenceBandLevel = "high" | "likely" | "uncertain";

interface ConfidenceBandProps {
  confidence: number;
  className?: string;
}

function getBandLevel(confidence: number): ConfidenceBandLevel {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "likely";
  return "uncertain";
}

const bandConfig: Record<
  ConfidenceBandLevel,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  high: { label: "High Confidence", variant: "default" },
  likely: { label: "Likely", variant: "secondary" },
  uncertain: { label: "Uncertain", variant: "outline" },
};

export function ConfidenceBand({ confidence, className }: ConfidenceBandProps) {
  const level = getBandLevel(confidence);
  const config = bandConfig[level];
  const percentage = Math.round(confidence * 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Badge variant={config.variant} className={cn("font-mono", className)}>
              {config.label}
            </Badge>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <span className="font-mono">{percentage}% confidence</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
