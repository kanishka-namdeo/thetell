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
import { motion } from "motion/react";

interface ConfidenceBandProps {
  confidence: number;
  className?: string;
  label?: string;
}

export function ConfidenceBand({ confidence, className, label }: ConfidenceBandProps) {
  const percentage = Math.round(confidence * 100);
  const band = getConfidenceBand(confidence);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Badge
              className={cn(
                "font-mono cursor-help",
                band.color,
                band.bgColor,
                className
              )}
            >
              {label || band.label}
            </Badge>
          </motion.div>
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
