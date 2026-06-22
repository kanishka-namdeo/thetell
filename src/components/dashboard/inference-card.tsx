"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "./confidence-badge";
import { MomentumIndicator } from "./momentum-indicator";
import { ExpandableSection } from "./expandable-section";
import { cn } from "@/lib/utils";
import { ChevronRight, Layers } from "lucide-react";

type InferenceStatus =
  | "EMERGING"
  | "DEVELOPING"
  | "CONFIRMED"
  | "REFUTED"
  | "RESOLVED";

type ThemeStatus =
  | "EMERGING"
  | "ACCELERATING"
  | "PEAKED"
  | "FADING"
  | "RESOLVED";

interface AgentPosition {
  position: string;
  reasoning: string;
  keyEvidence?: string[];
}

interface CrossSignalDebateSummary {
  analystPosition: AgentPosition;
  gossipPosition: AgentPosition;
  agreements?: string[];
  contentions?: Array<{
    topic: string;
    analystView: string;
    gossipView: string;
  }>;
  synthesis?: string;
}

interface StructuredDebate {
  consensusReached: boolean;
  analystClaim?: string;
  gossipClaim?: string;
}

interface InferenceCardProps {
  inference: {
    id: string;
    title: string;
    hypothesis: string;
    confidence: number;
    status: InferenceStatus;
    supportingSignalIds: string[];
    sourceTypesInvolved: string[];
    company: {
      name: string;
      ticker?: string | null;
      slug: string;
    };
    theme?: {
      id: string;
      label: string;
      status: ThemeStatus;
      momentum: number;
      signalCount?: number;
    } | null;
    crossSignalDebate?: CrossSignalDebateSummary | null;
    debate?: StructuredDebate | null;
  };
  supportingSignalCount?: number;
  className?: string;
}

const statusLabels: Record<InferenceStatus, string> = {
  EMERGING: "Emerging",
  DEVELOPING: "Developing",
  CONFIRMED: "Confirmed",
  REFUTED: "Refuted",
  RESOLVED: "Resolved",
};

const statusVariants: Record<
  InferenceStatus,
  "outline" | "default" | "accent" | "destructive" | "muted"
> = {
  EMERGING: "outline",
  DEVELOPING: "default",
  CONFIRMED: "accent",
  REFUTED: "destructive",
  RESOLVED: "muted",
};

const sourceTypeLabels: Record<string, string> = {
  NEWS: "News",
  FILING: "Filing",
  TRANSCRIPT: "Transcript",
  SOCIAL: "Social",
  BLOG: "Blog",
  JOB_POSTING: "Jobs",
  RSS: "RSS",
  PATENT: "Patent",
  LITIGATION: "Legal",
  FDA: "FDA",
  CONTRACT: "Contract",
  TECH_SIGNAL: "Tech",
  WEB_ARCHIVE: "Archive",
  LEGISLATION: "Legislation",
  ACADEMIC: "Academic",
  PODCAST: "Podcast",
  CONFERENCE: "Conference",
  PRESS_RELEASE: "Press",
  LOBBYING: "Lobbying",
};

export function InferenceCard({
  inference,
  supportingSignalCount,
  className,
}: InferenceCardProps) {
  const signalCount =
    supportingSignalCount ?? inference.supportingSignalIds.length;
  const sourceTypes = Array.isArray(inference.sourceTypesInvolved)
    ? inference.sourceTypesInvolved
    : [];
  const debate = inference.crossSignalDebate;
  const structuredDebate = inference.debate;

  return (
    <Card
      className={cn(
        "border-2 border-foreground hover:border-accent transition-colors",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className="text-[11px]">
                {inference.company.name}
                {inference.company.ticker && ` (${inference.company.ticker})`}
              </Badge>
              <Badge variant={statusVariants[inference.status]}>
                {statusLabels[inference.status]}
              </Badge>
              <ConfidenceBadge confidence={inference.confidence} />
            </div>
            <Link
              href={`/inferences/${inference.id}`}
              className="font-serif text-base font-semibold text-foreground hover:underline line-clamp-2"
            >
              {inference.title}
            </Link>
          </div>
          {inference.theme && (
            <MomentumIndicator
              momentum={inference.theme.momentum}
              status={inference.theme.status}
              signalCount={
                inference.theme.signalCount ?? signalCount
              }
              showLabel={false}
              className="shrink-0"
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-body text-muted-foreground line-clamp-2">
          {inference.hypothesis}
        </p>

        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {signalCount} signal{signalCount !== 1 ? "s" : ""}
          </span>
          {sourceTypes.length > 0 && (
            <span className="inline-flex items-center gap-1 flex-wrap">
              {sourceTypes.map((st) => (
                <span key={st} className="uppercase tracking-wider">
                  {sourceTypeLabels[st] || st}
                </span>
              ))}
            </span>
          )}
        </div>

        {debate && (
          <ExpandableSection
            expandLabel="View agent debate"
            collapseLabel="Hide debate"
            expandableContent={
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border-l-2 border-agent-analyst pl-3">
                    <Badge variant="analyst" className="mb-1.5 text-[10px]">
                      The Analyst
                    </Badge>
                    <p className="text-xs font-body text-foreground">
                      {debate.analystPosition.position}
                    </p>
                  </div>
                  <div className="border-l-2 border-agent-gossip pl-3">
                    <Badge variant="gossip" className="mb-1.5 text-[10px]">
                      Gossip Girl
                    </Badge>
                    <p className="text-xs font-body text-foreground">
                      {debate.gossipPosition.position}
                    </p>
                  </div>
                </div>
                {debate.synthesis && (
                  <div className="border border-border rounded-md p-2">
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Synthesis
                    </p>
                    <p className="text-xs font-body text-foreground">
                      {debate.synthesis}
                    </p>
                  </div>
                )}
              </div>
            }
          >
            <div />
          </ExpandableSection>
        )}

        {structuredDebate && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {structuredDebate.consensusReached ? "Consensus" : "Divergent"}
              </span>
            </div>
            {structuredDebate.analystClaim && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                <span className="font-semibold text-agent-analyst">Analyst:</span>{" "}
                {structuredDebate.analystClaim}
              </p>
            )}
            {structuredDebate.gossipClaim && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                <span className="font-semibold text-agent-gossip">Gossip Girl:</span>{" "}
                {structuredDebate.gossipClaim}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Link
            href={`/inferences/${inference.id}`}
            className="text-xs font-mono uppercase tracking-wider text-foreground hover:text-accent transition-colors inline-flex items-center gap-1 min-h-10"
          >
            View details <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
