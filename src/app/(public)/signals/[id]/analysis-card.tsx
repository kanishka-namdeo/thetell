"use client";

import {
  Body,
  Badge,
  Card,
  CardContent,
  CardHeader,
  Metadata,
} from "@/components";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { ExpandableSection } from "@/components/dashboard/expandable-section";
import { cn } from "@/lib/utils";

// Type guards for agent-specific data shapes
function isAnalystFact(fact: unknown): fact is {
  text: string;
  category: string;
  confidence: number;
  sourceSentence?: string;
} {
  return typeof fact === "object" && fact !== null && "category" in fact;
}

function isGossipFact(fact: unknown): fact is {
  text: string;
  tell_type: string;
  tell_strength: number;
  subtext: string;
  source_sentence: string;
} {
  return typeof fact === "object" && fact !== null && "tell_type" in fact;
}

function isAnalystTheme(theme: unknown): theme is {
  label: string;
  evidence: string[];
  correlation_hints?: string[];
} {
  return typeof theme === "object" && theme !== null && "correlation_hints" in theme;
}

function isGossipTheme(theme: unknown): theme is {
  label: string;
  evidence: string[];
  narrativeHook: string;
} {
  return typeof theme === "object" && theme !== null && "narrativeHook" in theme;
}

function getFactStrength(fact: unknown): number {
  if (isAnalystFact(fact)) return fact.confidence;
  if (isGossipFact(fact)) return fact.tell_strength;
  return 0;
}

interface AnalysisCardComponentProps {
  analysis: {
    id: string;
    agentPersona: string;
    summary: string | null;
    keyFacts: unknown;
    sentiment: unknown;
    strategicThemes: unknown;
    confidence: number;
    sourceMatchPreference?: boolean | null;
  };
  categoryLabels: Record<string, string>;
  tellTypeLabels: Record<string, string>;
  surfaceReadingLabels: Record<string, string>;
}

function FactItem({
  fact,
  isAnalyst,
  categoryLabels,
  tellTypeLabels,
}: {
  fact: unknown;
  isAnalyst: boolean;
  categoryLabels: Record<string, string>;
  tellTypeLabels: Record<string, string>;
}) {
  const factText = isAnalystFact(fact)
    ? fact.text
    : isGossipFact(fact)
    ? fact.text
    : typeof fact === "object" && fact !== null && "text" in fact
    ? (fact as { text: string }).text
    : String(fact);

  return (
    <li
      className={cn(
        "border-l-2 pl-3",
        isAnalyst ? "border-agent-analyst" : "border-agent-gossip"
      )}
    >
      <p className="text-sm font-body text-foreground">{factText}</p>
      {isAnalystFact(fact) && (
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-[11px]">
            {categoryLabels[fact.category] || fact.category}
          </Badge>
        </div>
      )}
      {isGossipFact(fact) && (
        <>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="tell" className="text-[11px]">
              {tellTypeLabels[fact.tell_type] || fact.tell_type}
            </Badge>
          </div>
          {fact.subtext && (
            <p className="text-xs text-muted-foreground italic mt-1">
              {fact.subtext}
            </p>
          )}
        </>
      )}
    </li>
  );
}

function ThemeItem({
  theme,
  isAnalyst,
}: {
  theme: unknown;
  isAnalyst: boolean;
}) {
  return (
    <div className="border border-foreground p-3">
      <Badge variant={isAnalyst ? "outline" : "theme"} className="mb-2">
        {isGossipTheme(theme)
          ? theme.label
          : isAnalystTheme(theme)
          ? theme.label
          : typeof theme === "object" && theme !== null && "label" in theme
          ? (theme as { label: string }).label
          : String(theme)}
      </Badge>
      {isAnalystTheme(theme) && theme.correlation_hints && theme.correlation_hints.length > 0 && (
        <div className="space-y-1 mt-2">
          {theme.correlation_hints.map((hint, j) => (
            <p key={j} className="text-xs font-mono text-muted-foreground">
              → {hint}
            </p>
          ))}
        </div>
      )}
      {isGossipTheme(theme) && theme.narrativeHook && (
        <p className="text-xs text-muted-foreground italic mt-2">
          {theme.narrativeHook}
        </p>
      )}
    </div>
  );
}

export function AnalysisCardComponent({
  analysis,
  categoryLabels,
  tellTypeLabels,
  surfaceReadingLabels,
}: AnalysisCardComponentProps) {
  const isAnalyst = analysis.agentPersona === "ANALYST";
  const isGossip = analysis.agentPersona === "GOSSIP_GIRL";

  const facts = Array.isArray(analysis.keyFacts) ? analysis.keyFacts : [];
  const themes = Array.isArray(analysis.strategicThemes) ? analysis.strategicThemes : [];

  // Sort facts by confidence/tell_strength descending
  const sortedFacts = [...facts].sort(
    (a, b) => getFactStrength(b) - getFactStrength(a)
  );
  const topFacts = sortedFacts.slice(0, 3);
  const remainingFacts = sortedFacts.slice(3);

  const topThemes = themes.slice(0, 2);
  const remainingThemes = themes.slice(2);

  return (
    <Card
      className={cn(
        "border-2 border-foreground",
        isAnalyst && "border-l-4 border-l-agent-analyst",
        isGossip && "border-l-4 border-l-agent-gossip"
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Badge variant={isAnalyst ? "analyst" : "gossip"}>
              {isAnalyst ? "The Analyst" : "Gossip Girl"}
            </Badge>
            {analysis.sourceMatchPreference && (
              <Badge variant="outline" className="text-[10px]">
                Preferred Source
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isGossip ? (
              <ConfidenceBand confidence={analysis.confidence} label="Tell Strength" />
            ) : (
              <ConfidenceBand confidence={analysis.confidence} />
            )}
            {isAnalyst && !!analysis.sentiment && (
              <SentimentIndicator
                sentiment={
                  ((analysis.sentiment as { sentiment?: string }).sentiment || "NEUTRAL") as
                    | "POSITIVE"
                    | "NEGATIVE"
                    | "NEUTRAL"
                }
                strength={
                  (analysis.sentiment as { strength?: "STRONGLY" | "MILDY" }).strength
                }
              />
            )}
            {isGossip &&
              (analysis.sentiment as { surface_reading?: string })?.surface_reading && (
                <Badge variant="outline" className="font-mono text-xs">
                  {surfaceReadingLabels[
                    (analysis.sentiment as { surface_reading: string }).surface_reading
                  ] ||
                    (analysis.sentiment as { surface_reading: string }).surface_reading}
                </Badge>
              )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary / The Real Story */}
        {analysis.summary && (
          <div>
            <Metadata className="mb-2">
              {isAnalyst ? "Summary" : "The Real Story"}
            </Metadata>
            <Body>{analysis.summary}</Body>
          </div>
        )}

        {/* Key Facts / The Tells — progressive disclosure */}
        {facts.length > 0 && (
          <div>
            <Metadata className="mb-2">
              {isAnalyst ? "Key Facts" : "The Tells"}
            </Metadata>
            {remainingFacts.length > 0 ? (
              <ExpandableSection
                expandLabel={`View all ${facts.length} ${isAnalyst ? "facts" : "tells"}`}
                collapseLabel="Show less"
                expandableContent={
                  <ul className="space-y-2 list-none">
                    {remainingFacts.map((fact, idx) => (
                      <FactItem
                        key={idx + 3}
                        fact={fact}
                        isAnalyst={isAnalyst}
                        categoryLabels={categoryLabels}
                        tellTypeLabels={tellTypeLabels}
                      />
                    ))}
                  </ul>
                }
              >
                <ul className="space-y-2 list-none">
                  {topFacts.map((fact, idx) => (
                    <FactItem
                      key={idx}
                      fact={fact}
                      isAnalyst={isAnalyst}
                      categoryLabels={categoryLabels}
                      tellTypeLabels={tellTypeLabels}
                    />
                  ))}
                </ul>
              </ExpandableSection>
            ) : (
              <ul className="space-y-2 list-none">
                {topFacts.map((fact, idx) => (
                  <FactItem
                    key={idx}
                    fact={fact}
                    isAnalyst={isAnalyst}
                    categoryLabels={categoryLabels}
                    tellTypeLabels={tellTypeLabels}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Strategic Themes / The Drama — progressive disclosure */}
        {themes.length > 0 && (
          <div>
            <Metadata className="mb-2">
              {isAnalyst ? "Strategic Themes" : "The Drama"}
            </Metadata>
            {remainingThemes.length > 0 ? (
              <ExpandableSection
                expandLabel={`View all ${themes.length} themes`}
                collapseLabel="Show less"
                expandableContent={
                  <div className="space-y-3">
                    {remainingThemes.map((theme, idx) => (
                      <ThemeItem key={idx + 2} theme={theme} isAnalyst={isAnalyst} />
                    ))}
                  </div>
                }
              >
                <div className="space-y-3">
                  {topThemes.map((theme, idx) => (
                    <ThemeItem key={idx} theme={theme} isAnalyst={isAnalyst} />
                  ))}
                </div>
              </ExpandableSection>
            ) : (
              <div className="space-y-3">
                {topThemes.map((theme, idx) => (
                  <ThemeItem key={idx} theme={theme} isAnalyst={isAnalyst} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
