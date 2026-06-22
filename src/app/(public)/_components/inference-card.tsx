"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { Brain } from "lucide-react";

interface InferenceCardProps {
  inference: {
    id: string;
    title: string;
    confidence: number;
    status: string;
    createdAt: Date | string;
    company: { name: string; ticker?: string | null };
    _count?: { supportingSignals?: number };
    sourceTypesInvolved?: unknown;
  };
  sourceTypeCount?: number;
  signalCount?: number;
}

const STATUS_LABELS: Record<string, string> = {
  EMERGING: "Emerging",
  DEVELOPING: "Developing",
  CONFIRMED: "Confirmed",
  REFUTED: "Refuted",
  RESOLVED: "Resolved",
};

export function InferenceCard({
  inference,
  sourceTypeCount,
  signalCount,
}: InferenceCardProps) {
  const stCount =
    sourceTypeCount ??
    (Array.isArray(inference.sourceTypesInvolved)
      ? inference.sourceTypesInvolved.length
      : 0);
  const sigCount =
    signalCount ?? inference._count?.supportingSignals ?? 0;

  return (
    <Link
      href={`/inferences/${inference.id}`}
      className="block border-l-4 border-l-brand bg-card border border-border p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <Brain className="h-5 w-5 text-brand shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground mb-1">
            STRATEGIC INFERENCE
          </p>
          <h3 className="font-serif font-bold text-lg leading-tight mb-2">
            {inference.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs">
              {inference.company.name}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {STATUS_LABELS[inference.status] ?? inference.status}
            </Badge>
            <ConfidenceBand confidence={inference.confidence} />
          </div>
          <p className="text-xs text-muted-foreground">
            Based on {sigCount} signal{sigCount !== 1 ? "s" : ""} from{" "}
            {stCount} source type{stCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}
