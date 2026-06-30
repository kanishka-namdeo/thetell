"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";

interface EvidenceChainItem {
  signalId: string;
  signalTitle: string;
  sourceType: string;
  scrapedAt: Date | string;
  confidence: number;
  sentiment: string;
  agentPersona: string;
}

interface EvidenceChainProps {
  items: EvidenceChainItem[];
  inferenceTitle?: string;
  inferenceConfidence?: number;
}

export function EvidenceChain({
  items,
  inferenceTitle,
  inferenceConfidence,
}: EvidenceChainProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-foreground">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Evidence Chain
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {items.length} signal{items.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={item.signalId} className="relative">
              <div className="flex items-start gap-3 p-3 border-l-4 border-foreground bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/signals/${item.signalId}`}
                    className="text-sm font-serif font-medium hover:underline line-clamp-2"
                  >
                    {item.signalTitle}
                  </Link>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {item.sourceType}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {item.agentPersona === "ANALYST" ? "Analyst" : "Gossip Girl"}
                    </Badge>
                    <ConfidenceBand confidence={item.confidence} />
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(item.scrapedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                {index < items.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 hidden md:block" />
                )}
              </div>
            </div>
          ))}

          {inferenceTitle && inferenceConfidence !== undefined && (
            <div className="pt-4 border-t-2 border-foreground">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="h-4 w-4 text-foreground" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Inference
                </span>
              </div>
              <div className="p-3 border-2 border-foreground bg-background">
                <p className="text-sm font-serif font-semibold mb-2">
                  {inferenceTitle}
                </p>
                <ConfidenceBand confidence={inferenceConfidence} />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
