import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ConsensusLevel = "strong-agreement" | "mixed-signals" | "divergent-views";

type ThemeEntry = string | { label: string } | Record<string, unknown> | unknown;

interface ConsensusBadgeProps {
  consensus: ConsensusLevel;
  className?: string;
}

const consensusConfig: Record<ConsensusLevel, { label: string; variant: "default" | "secondary" | "outline" }> = {
  "strong-agreement": { label: "Strong Agreement", variant: "default" },
  "mixed-signals": { label: "Mixed Signals", variant: "secondary" },
  "divergent-views": { label: "Divergent Views", variant: "outline" },
};

export function ConsensusBadge({ consensus, className }: ConsensusBadgeProps) {
  const config = consensusConfig[consensus];

  return (
    <Badge variant={config.variant} className={cn("font-mono", className)}>
      {config.label}
    </Badge>
  );
}

export function calculateConsensus(
  analyses: Array<{
    sentiment: string;
    strategicThemes: unknown;
    confidence: number;
  }>
): ConsensusLevel | null {
  if (analyses.length < 2) {
    return null;
  }

  const sentiments = analyses.map((a) => a.sentiment);
  const allSameSentiment = sentiments.every((s) => s === sentiments[0]);

  const themeSets = analyses.map((a) => {
    if (!Array.isArray(a.strategicThemes)) return new Set<string>();
    const themes: string[] = [];
    for (const t of a.strategicThemes) {
      if (typeof t === "object" && t !== null && "label" in t) {
        themes.push((t as { label: string }).label);
      } else {
        themes.push(String(t));
      }
    }
    return new Set(themes);
  });

  const allThemes = new Set<string>();
  themeSets.forEach((set) => set.forEach((t) => allThemes.add(t)));

  let sharedThemeCount = 0;
  allThemes.forEach((theme) => {
    const count = themeSets.filter((set) => set.has(theme)).length;
    if (count === analyses.length) {
      sharedThemeCount++;
    }
  });

  const hasSharedThemes = sharedThemeCount > 0;

  if (allSameSentiment && hasSharedThemes) {
    return "strong-agreement";
  } else if (allSameSentiment && !hasSharedThemes) {
    return "mixed-signals";
  } else {
    return "divergent-views";
  }
}
