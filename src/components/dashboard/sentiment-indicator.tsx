"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "motion/react";

interface SentimentIndicatorProps {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  className?: string;
  showLabel?: boolean;
}

export function SentimentIndicator({
  sentiment,
  className,
  showLabel = true,
}: SentimentIndicatorProps) {
  const config = {
    POSITIVE: {
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10",
      borderColor: "border-success",
      label: "Positive",
    },
    NEGATIVE: {
      icon: TrendingDown,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive",
      label: "Negative",
    },
    NEUTRAL: {
      icon: Minus,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      borderColor: "border-border",
      label: "Neutral",
    },
  };

  const { icon: Icon, color, bgColor, borderColor, label } = config[sentiment];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 border font-mono text-xs uppercase tracking-wider",
        bgColor,
        borderColor,
        color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{label}</span>}
    </motion.div>
  );
}
