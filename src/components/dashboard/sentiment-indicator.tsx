"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "motion/react";

interface SentimentIndicatorProps {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  strength?: "STRONGLY" | "MILDY";
  className?: string;
  showLabel?: boolean;
}

export function SentimentIndicator({
  sentiment,
  strength,
  className,
  showLabel = true,
}: SentimentIndicatorProps) {
  const getLabel = () => {
    if (!strength) {
      return sentiment.charAt(0) + sentiment.slice(1).toLowerCase();
    }
    
    const strengthPrefix = strength === "STRONGLY" ? "Strongly " : "Mildly ";
    return strengthPrefix + sentiment.charAt(0) + sentiment.slice(1).toLowerCase();
  };

  const config = {
    POSITIVE: {
      icon: TrendingUp,
      color: strength === "STRONGLY" ? "text-success" : "text-success/70",
      bgColor: strength === "STRONGLY" ? "bg-success/10" : "bg-success/5",
      borderColor: "border-success",
      label: getLabel(),
    },
    NEGATIVE: {
      icon: TrendingDown,
      color: strength === "STRONGLY" ? "text-destructive" : "text-destructive/70",
      bgColor: strength === "STRONGLY" ? "bg-destructive/10" : "bg-destructive/5",
      borderColor: "border-destructive",
      label: getLabel(),
    },
    NEUTRAL: {
      icon: Minus,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      borderColor: "border-border",
      label: getLabel(),
    },
  };

  const { icon: Icon, color, bgColor, borderColor, label } = config[sentiment];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "inline-flex items-center gap-1.5 border font-mono text-xs uppercase tracking-wider w-fit",
        showLabel ? "px-2 py-1" : "px-1.5 py-0.5",
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
