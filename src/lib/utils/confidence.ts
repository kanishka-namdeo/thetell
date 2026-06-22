export interface ConfidenceBand {
  label: string;
  color: string; // tailwind text color class
  bgColor: string; // tailwind bg color class
  description: string;
}

export function getConfidenceBand(confidence: number): ConfidenceBand {
  // Clamp to valid [0, 1] range
  const clamped = Math.max(0, Math.min(1, confidence));

  if (clamped >= 0.85) {
    return {
      label: "High Confidence",
      color: "text-success",
      bgColor: "bg-success/10",
      description: "Strong evidence supports this analysis",
    };
  }
  if (clamped >= 0.7) {
    return {
      label: "Likely",
      color: "text-info",
      bgColor: "bg-info/10",
      description: "Moderate evidence with some uncertainty",
    };
  }
  if (clamped >= 0.55) {
    return {
      label: "Uncertain",
      color: "text-warning",
      bgColor: "bg-warning/10",
      description: "Limited evidence, treat with caution",
    };
  }
  return {
    label: "Low Confidence",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    description: "Insufficient evidence to draw conclusions",
  };
}
