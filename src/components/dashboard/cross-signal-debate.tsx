"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";

interface ContentionPoint {
  topic: string;
  analystView: string;
  gossipGirlView: string;
  evidence?: string[];
}

interface StructuredDebateProps {
  debate: {
    analyst: {
      claim: string;
      evidence: string[];
      confidence: number;
    };
    gossipGirl: {
      claim: string;
      evidence: string[];
      tellStrength: number;
    };
    agreements: string[];
    contentions: ContentionPoint[];
    synthesis: string;
  };
  consensusReached?: boolean;
  className?: string;
}

export function CrossSignalDebateView({
  debate,
  consensusReached,
  className,
}: StructuredDebateProps) {
  const { analyst, gossipGirl, agreements, contentions, synthesis } = debate;

  // Determine consensus status
  const hasAgreements = agreements && agreements.length > 0;
  const hasContentions = contentions && contentions.length > 0;

  let consensusStatus: "strong" | "partial" | "divergent" = "divergent";
  if (consensusReached) {
    consensusStatus = "strong";
  } else if (hasAgreements && hasContentions) {
    consensusStatus = "partial";
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Consensus Summary Bar */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg border",
          consensusStatus === "strong" &&
            "bg-success/5 border-success/30 text-success",
          consensusStatus === "partial" &&
            "bg-warning/5 border-warning/30 text-warning",
          consensusStatus === "divergent" &&
            "bg-muted/30 border-foreground/20 text-muted-foreground"
        )}
      >
        {consensusStatus === "strong" && (
          <>
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">Strong Consensus</span>
          </>
        )}
        {consensusStatus === "partial" && (
          <>
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">Partial Agreement</span>
          </>
        )}
        {consensusStatus === "divergent" && (
          <span className="text-sm font-medium">Divergent Views</span>
        )}
      </div>

      {/* Side-by-side Agent Position Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Analyst Card */}
        <Card className="border-l-4 border-l-agent-analyst border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="analyst">The Analyst</Badge>
              <ConfidenceBand confidence={analyst.confidence} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Position
              </p>
              <p className="text-sm font-body text-foreground">
                {analyst.claim || (
                  <span className="text-muted-foreground italic">
                    No position available
                  </span>
                )}
              </p>
            </div>
            {analyst.evidence && analyst.evidence.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  Evidence
                </p>
                <ul className="space-y-1">
                  {analyst.evidence.map((evidence, idx) => (
                    <li
                      key={idx}
                      className="text-xs font-body text-foreground border-l-2 border-agent-analyst pl-2"
                    >
                      {evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gossip Girl Card */}
        <Card className="border-l-4 border-l-agent-gossip border-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="gossip">Gossip Girl</Badge>
              <ConfidenceBand
                confidence={gossipGirl.tellStrength}
                label="Tell Strength"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Position
              </p>
              <p className="text-sm font-body text-foreground">
                {gossipGirl.claim || (
                  <span className="text-muted-foreground italic">
                    No position available
                  </span>
                )}
              </p>
            </div>
            {gossipGirl.evidence && gossipGirl.evidence.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  Evidence
                </p>
                <ul className="space-y-1">
                  {gossipGirl.evidence.map((evidence, idx) => (
                    <li
                      key={idx}
                      className="text-xs font-body text-foreground border-l-2 border-agent-gossip pl-2"
                    >
                      {evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Points of Agreement */}
      {hasAgreements && (
        <Card className="border border-success/30 bg-success/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <p className="text-xs font-mono uppercase tracking-wider text-foreground">
                Points of Agreement
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {agreements.map((agreement, idx) => (
                <li
                  key={idx}
                  className="text-sm font-body text-foreground flex items-start gap-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span>{agreement}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Points of Contention */}
      {hasContentions && (
        <Card className="border border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-warning" />
              <p className="text-xs font-mono uppercase tracking-wider text-foreground">
                Points of Contention
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {contentions.map((contention, idx) => (
                <div key={idx} className="space-y-2">
                  <p className="text-sm font-serif font-semibold text-foreground">
                    {contention.topic}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border-l-2 border-agent-analyst pl-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                        Analyst
                      </p>
                      <p className="text-xs font-body text-foreground">
                        {contention.analystView}
                      </p>
                    </div>
                    <div className="border-l-2 border-agent-gossip pl-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                        Gossip Girl
                      </p>
                      <p className="text-xs font-body text-foreground">
                        {contention.gossipGirlView}
                      </p>
                    </div>
                  </div>
                  {contention.evidence && contention.evidence.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                        Evidence
                      </p>
                      <ul className="space-y-1">
                        {contention.evidence.map((ev, j) => (
                          <li
                            key={j}
                            className="text-xs font-body text-muted-foreground"
                          >
                            • {ev}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Synthesis */}
      {synthesis && (
        <>
          <Separator />
          <Card className="border border-foreground bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-foreground" />
                <p className="text-xs font-mono uppercase tracking-wider text-foreground">
                  Synthesis
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-body text-foreground leading-relaxed">
                {synthesis}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
