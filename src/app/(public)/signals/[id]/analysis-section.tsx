"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { AgentFilter, type AgentFilterValue } from "../../_components/agent-filter";
import { AnalysisCardComponent } from "./analysis-card";
import { Badge } from "@/components";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  /** When true, show simplified summary instead of full dual-agent cards */
  isClustered?: boolean;
}

/**
 * Extract a flat list of fact texts from an analysis's keyFacts field.
 */
function extractFactTexts(keyFacts: unknown): string[] {
  if (!Array.isArray(keyFacts)) return [];
  return keyFacts
    .map((f) => {
      if (typeof f === "string") return f;
      if (f && typeof f === "object" && "text" in f) return (f as { text: string }).text;
      return null;
    })
    .filter((v): v is string => v !== null);
}

/**
 * Extract sentiment label string from the unknown sentiment field.
 */
function extractSentimentLabel(sentiment: unknown): string | null {
  if (typeof sentiment === "string") return sentiment;
  if (sentiment && typeof sentiment === "object") {
    const s = sentiment as Record<string, unknown>;
    if (typeof s.sentiment === "string") return s.sentiment;
    if (typeof s.surface_reading === "string") return s.surface_reading as string;
  }
  return null;
}

/**
 * Clustered signal variant: shows a compact summary of facts, sentiment, and themes
 * without the full dual-agent debate cards.
 */
function ClusteredAnalysisSummary({
  analyses,
}: {
  analyses: AnalysisSectionProps["analyses"];
}) {
  // Merge facts from both agents, deduplicate
  const allFacts = new Set<string>();
  const sentiments: string[] = [];
  const allThemes = new Set<string>();

  for (const analysis of analyses) {
    for (const fact of extractFactTexts(analysis.keyFacts)) {
      allFacts.add(fact);
    }
    const sent = extractSentimentLabel(analysis.sentiment);
    if (sent) sentiments.push(sent);
    const themes = Array.isArray(analysis.strategicThemes) ? analysis.strategicThemes : [];
    for (const t of themes) {
      if (t && typeof t === "object" && "label" in t) {
        allThemes.add((t as { label: string }).label);
      }
    }
  }

  const factsList = Array.from(allFacts).slice(0, 8);
  const themesList = Array.from(allThemes).slice(0, 5);
  const avgConfidence =
    analyses.length > 0
      ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
      : 0;

  return (
    <Card className="mb-6 border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cluster Analysis Summary</CardTitle>
          <Badge variant="outline">
            {analyses.length} agent{analyses.length !== 1 ? "s" : ""} · avg confidence {(avgConfidence * 100).toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Facts */}
        {factsList.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-2">
              Key Facts
            </p>
            <ul className="space-y-1">
              {factsList.map((fact, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sentiment + Themes row */}
        <div className="flex flex-wrap gap-4">
          {sentiments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Sentiment
              </p>
              <div className="flex gap-1">
                {[...new Set(sentiments)].map((s) => (
                  <Badge key={s} variant={s === "POSITIVE" ? "default" : s === "NEGATIVE" ? "destructive" : "outline"}>
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {themesList.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Themes
              </p>
              <div className="flex flex-wrap gap-1">
                {themesList.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalysisSection({
  analyses,
  categoryLabels,
  tellTypeLabels,
  surfaceReadingLabels,
  isClustered = false,
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

  // Clustered signals show a compact summary, not per-agent cards
  if (isClustered) {
    return <ClusteredAnalysisSummary analyses={analyses} />;
  }

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
