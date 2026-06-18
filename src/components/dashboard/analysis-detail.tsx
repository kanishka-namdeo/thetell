"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge } from "./confidence-badge";
import { SentimentIndicator } from "./sentiment-indicator";
import { AnalysisData, KeyFact, StrategicTheme } from "@/lib/api/schemas";
import { Brain, Lightbulb, Quote } from "lucide-react";

type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

interface AnalysisDetailProps {
  analysis: AnalysisData;
  agentPersona?: AgentPersona;
}

const categoryLabels: Record<string, string> = {
  financial: "Financial",
  strategic: "Strategic",
  operational: "Operational",
  personnel: "Personnel",
  market: "Market",
};

const agentLabels: Record<AgentPersona, string> = {
  ANALYST: "The Analyst",
  GOSSIP_GIRL: "Gossip Girl",
};

export function AnalysisDetail({ analysis, agentPersona }: AnalysisDetailProps) {
  const keyFacts = analysis.keyFacts as KeyFact[];
  const themes = analysis.strategicThemes as StrategicTheme[];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card
        className={
          agentPersona === "ANALYST"
            ? "border-l-4 border-l-primary"
            : agentPersona === "GOSSIP_GIRL"
            ? "border-l-4 border-l-accent"
            : undefined
        }
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {agentPersona && (
                <Badge
                  variant={agentPersona === "ANALYST" ? "default" : "accent"}
                >
                  {agentLabels[agentPersona]}
                </Badge>
              )}
              <CardTitle className="text-lg">Analysis Summary</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <SentimentIndicator sentiment={analysis.sentiment} />
              <ConfidenceBadge confidence={analysis.confidence} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-body leading-relaxed">{analysis.summary}</p>
          <div className="mt-3 text-xs font-mono text-muted-foreground">
            Model: {analysis.modelUsed} · Analyzed:{" "}
            {new Date(analysis.analyzedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </CardContent>
      </Card>

      {/* Key Facts */}
      {keyFacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Key Facts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {keyFacts.map((fact, i) => (
                <div key={i} className="flex gap-3 border-l-2 border-foreground pl-3">
                  <div className="flex-1">
                    <p className="text-sm font-body">{fact.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[9px]">
                        {categoryLabels[fact.category] || fact.category}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {Math.round(fact.confidence * 100)}% confidence
                      </span>
                    </div>
                    {fact.sourceSentence && (
                      <p className="text-xs text-muted-foreground mt-1 italic font-body">
                        <Quote className="h-3 w-3 inline mr-1" />
                        {fact.sourceSentence}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strategic Themes */}
      {themes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Strategic Themes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {themes.map((theme, i) => (
                <div key={i} className="border border-foreground p-4">
                  <Badge variant="default" className="mb-2 uppercase tracking-widest text-[10px]">
                    {theme.label}
                  </Badge>
                  <div className="space-y-1">
                    {theme.evidence.map((ev, j) => (
                      <p key={j} className="text-sm font-body text-muted-foreground">
                        • {ev}
                      </p>
                    ))}
                  </div>
                  {theme.correlationHints && theme.correlationHints.length > 0 && (
                    <>
                      <Separator className="my-2" />
                      <div className="space-y-1">
                        {theme.correlationHints.map((hint, j) => (
                          <p key={j} className="text-xs font-mono text-muted-foreground">
                            → {hint}
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
