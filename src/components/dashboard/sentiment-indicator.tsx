"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-600",
      label: "Positive",
    },
    NEGATIVE: {
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-600",
      label: "Negative",
    },
    NEUTRAL: {
      icon: Minus,
      color: "text-neutral-600",
      bgColor: "bg-neutral-50",
      borderColor: "border-neutral-600",
      label: "Neutral",
    },
  };

  const { icon: Icon, color, bgColor, borderColor, label } = config[sentiment];

  return (
    <div
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
    </div>
  );
}
