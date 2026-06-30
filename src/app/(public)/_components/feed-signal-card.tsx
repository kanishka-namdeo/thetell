"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { Metadata } from "@/components";
import Link from "next/link";
import { motion } from "motion/react";
import { ExternalLink, BadgeCheck, Layers } from "lucide-react";
import { SentimentBadge } from "./sentiment-badge";
import { MomentumArrow } from "./momentum-arrow";
import { calculateConsensus, ConsensusBadge } from "../signals/[id]/consensus-badge";

type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

interface FeedSignalCardProps {
  signal: {
    id: string;
    title: string;
    sourceType: string;
    sourceUrl: string;
    scrapedAt: Date;
    verified?: boolean | null;
    feedLabel?: string | null;
    company: {
      id: string;
      name: string;
    };
    analyses: Array<{
      confidence: number;
      sentiment?: string | null;
      sentimentData?: unknown;
      agentPersona: AgentPersona;
      strategicThemes?: unknown;
    }>;
    cluster?: {
      id: string;
      label: string;
      momentum?: number;
      _count?: { clusteredSignals: number };
    } | null;
  };
}

export function FeedSignalCard({ signal }: FeedSignalCardProps) {
  const formattedDate = new Date(signal.scrapedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const topConfidence = Math.max(...signal.analyses.map((a) => a.confidence));

  const consensus = calculateConsensus(
    signal.analyses.map((a) => ({
      sentiment: (typeof a.sentiment === "object" && a.sentiment !== null
        ? (a.sentiment as { sentiment?: string }).sentiment || "NEUTRAL"
        : a.sentiment || "NEUTRAL") as string,
      strategicThemes: a.strategicThemes,
      confidence: a.confidence,
    }))
  );

  // Extract domain from sourceUrl
  let sourceDomain: string | null = null;
  if (signal.sourceUrl) {
    try {
      sourceDomain = new URL(signal.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      // Invalid URL, ignore
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
    >
      <Card className="border-foreground/80 hover:bg-muted/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">
              {signal.company.name}
            </Badge>
            <Badge variant="secondary">{signal.sourceType}</Badge>
            {signal.cluster && (
              <Link
                href={`/clusters/${signal.cluster.id}`}
                className="inline-flex items-center gap-1"
              >
                <Badge variant="accent" className="text-[10px] gap-0.5">
                  <Layers className="h-3 w-3" />
                  Cluster
                  {signal.cluster._count?.clusteredSignals && (
                    <span>({signal.cluster._count.clusteredSignals})</span>
                  )}
                </Badge>
                {signal.cluster.momentum !== undefined && (
                  <MomentumArrow momentum={signal.cluster.momentum} />
                )}
              </Link>
            )}
            {consensus && <ConsensusBadge consensus={consensus} />}
          </div>
          <div className="flex items-start justify-between gap-4 min-w-0">
            <CardTitle className="text-lg min-w-0">
              <Link
                href={`/signals/${signal.id}`}
                className="hover:underline line-clamp-2"
              >
                {signal.title}
              </Link>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Metadata>{formattedDate}</Metadata>

            {/* Source domain with optional verification */}
            {sourceDomain ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {signal.verified && (
                  <BadgeCheck className="h-3 w-3 text-primary" />
                )}
                <Link
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {signal.feedLabel || sourceDomain}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ) : null}

            {signal.analyses.length > 0 && (
              <ConfidenceBand confidence={topConfidence} />
            )}
            {/* Sentiment indicators per agent */}
            {signal.analyses.map((a, i) => (
              <SentimentBadge
                key={i}
                sentiment={a.sentiment}
                sentimentData={a.sentimentData}
                agentPersona={a.agentPersona}
              />
            ))}
            {signal.analyses.length > 0 && (
              <Metadata className="ml-auto text-muted-foreground">
                {signal.analyses.length > 1 ? `${signal.analyses.length} voices` : "1 voice"}
              </Metadata>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
