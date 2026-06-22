"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { AgentFilter, type AgentFilterValue } from "../../_components/agent-filter";
import { AnalysisCardComponent } from "./analysis-card";
import { cn } from "@/lib/utils";

type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

interface AnalysisSectionProps {
  analyses: Array<{
    id: string;
    agentPersona: AgentPersona;
    confidence: number;
    summary: string | null;
    sentiment: unknown;
    keyFacts: unknown;
    strategicThemes: unknown;
  }>;
  categoryLabels: Record<string, string>;
  tellTypeLabels: Record<string, string>;
  surfaceReadingLabels: Record<string, string>;
}

export function AnalysisSection({
  analyses,
  categoryLabels,
  tellTypeLabels,
  surfaceReadingLabels,
}: AnalysisSectionProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const agentFilter = (searchParams.get("voice") || "ALL") as AgentFilterValue;

  const handleFilterChange = (value: AgentFilterValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("voice");
    } else {
      params.set("voice", value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const visibleAgents: AgentPersona[] =
    agentFilter === "ALL"
      ? ["ANALYST", "GOSSIP_GIRL"]
      : agentFilter === "ANALYST"
      ? ["ANALYST"]
      : ["GOSSIP_GIRL"];

  const filteredAnalyses = analyses.filter((a) =>
    visibleAgents.includes(a.agentPersona)
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <AgentFilter value={agentFilter} onValueChange={handleFilterChange} />
      </div>

      {filteredAnalyses.length === 0 ? (
        <span className="text-sm text-muted-foreground text-center py-8 block">
          No analyses match this voice filter.
        </span>
      ) : (
        <div
          className={cn(
            filteredAnalyses.length === 1 ? "" : "grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"
          )}
        >
          {filteredAnalyses.map((analysis) => (
            <AnalysisCardComponent
              key={analysis.id}
              analysis={analysis}
              categoryLabels={categoryLabels}
              tellTypeLabels={tellTypeLabels}
              surfaceReadingLabels={surfaceReadingLabels}
            />
          ))}
        </div>
      )}
    </>
  );
}
