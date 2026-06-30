import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

interface SentimentBadgeProps {
  sentiment?: string | null;
  sentimentData?: unknown;
  agentPersona: AgentPersona;
  className?: string;
}

type SentimentTone = "positive" | "negative" | "neutral" | "mixed";

function resolveTone(
  sentiment: string | null | undefined,
  sentimentData: unknown,
  agentPersona: AgentPersona
): { tone: SentimentTone; label: string; personaLabel: string } {
  const personaLabel = agentPersona === "ANALYST" ? "Analyst" : "Gossip Girl";

  if (agentPersona === "ANALYST") {
    const s = (sentiment ?? "").toUpperCase();
    if (s.includes("POSITIVE")) {
      return { tone: "positive", label: "Positive", personaLabel };
    }
    if (s.includes("NEGATIVE")) {
      return { tone: "negative", label: "Negative", personaLabel };
    }
    if (s === "NEUTRAL") {
      return { tone: "neutral", label: "Neutral", personaLabel };
    }
    return { tone: "neutral", label: sentiment ?? "Neutral", personaLabel };
  }

  // Gossip Girl: parse surface_reading from sentimentData
  const data = sentimentData as { surface_reading?: string } | null;
  const reading = (data?.surface_reading ?? "").toLowerCase();
  if (reading.includes("bullish")) {
    return { tone: "positive", label: "Bullish spin", personaLabel };
  }
  if (reading.includes("bearish")) {
    return { tone: "negative", label: "Bearish subtext", personaLabel };
  }
  if (reading.includes("mixed")) {
    return { tone: "mixed", label: "Mixed signals", personaLabel };
  }
  if (reading.includes("neutral")) {
    return { tone: "neutral", label: "Neutral surface", personaLabel };
  }
  return { tone: "neutral", label: "Neutral surface", personaLabel };
}

const toneStyles: Record<SentimentTone, string> = {
  positive: "text-success",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
  mixed: "text-warning",
};

export function SentimentBadge({
  sentiment,
  sentimentData,
  agentPersona,
  className,
}: SentimentBadgeProps) {
  const { tone, label, personaLabel } = resolveTone(
    sentiment,
    sentimentData,
    agentPersona
  );

  const Icon =
    tone === "positive"
      ? TrendingUp
      : tone === "negative"
        ? TrendingDown
        : tone === "mixed"
          ? HelpCircle
          : Minus;

  const tooltipLabel = `${personaLabel}: ${label}`;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] uppercase tracking-widest font-mono",
            toneStyles[tone],
            className
          )}
          aria-label={tooltipLabel}
        >
          <Icon className="h-3 w-3" />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
