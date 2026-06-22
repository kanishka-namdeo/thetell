"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { Metadata } from "@/components";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUp, MessageSquare, ExternalLink, BadgeCheck } from "lucide-react";

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
    engagement?: unknown;
    metadata?: unknown;
    analyses: Array<{
      confidence: number;
      sentiment?: string;
      sentimentData?: unknown;
      surface_reading?: string;
      agentPersona: AgentPersona;
    }>;
  };
  visibleAgents?: AgentPersona[];
}

export function FeedSignalCard({ signal, visibleAgents = ["ANALYST", "GOSSIP_GIRL"] }: FeedSignalCardProps) {
  const formattedDate = new Date(signal.scrapedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const topConfidence = Math.max(...signal.analyses.map((a) => a.confidence));

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

            {signal.sourceType === "SOCIAL" && signal.engagement ? (() => {
              const eng = signal.engagement as { score?: number | null; likes?: number | null; comments?: number | null } | null;
              return (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {(eng?.score ?? eng?.likes) != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowUp className="h-3 w-3" />
                      {eng?.score ?? eng?.likes}
                    </span>
                  )}
                  {eng?.comments != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {eng.comments}
                    </span>
                  )}
                </div>
              );
            })() : null}
            {signal.sourceType === "SOCIAL" && signal.metadata ? (
              <Metadata className="text-xs text-muted-foreground">
                {(() => {
                  const meta = signal.metadata as { subreddit?: string } | null;
                  return meta?.subreddit ? `r/${meta.subreddit}` : null;
                })()}
              </Metadata>
            ) : null}
            {signal.analyses.length > 0 && (
              <ConfidenceBand confidence={topConfidence} />
            )}
            <Metadata className="ml-auto text-muted-foreground">
              {signal.analyses.length > 1 ? "2 voices" : "1 voice"}
            </Metadata>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
