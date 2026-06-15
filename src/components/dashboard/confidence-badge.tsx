"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);
  
  let variant: "default" | "secondary" | "outline" | "accent" = "outline";
  let label = "Low";
  
  if (confidence >= 0.8) {
    variant = "default";
    label = "High";
  } else if (confidence >= 0.6) {
    variant = "secondary";
    label = "Medium";
  } else if (confidence >= 0.4) {
    variant = "outline";
    label = "Low";
  } else {
    variant = "accent";
    label = "Very Low";
  }

  return (
    <Badge variant={variant} className={cn("font-mono", className)}>
      {percentage}% · {label}
    </Badge>
  );
}
