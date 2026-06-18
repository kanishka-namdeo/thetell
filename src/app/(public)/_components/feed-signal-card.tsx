"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { SentimentIndicator } from "@/components/dashboard/sentiment-indicator";
import { Metadata } from "@/components";
import Link from "next/link";
import { motion } from "motion/react";

type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

interface FeedSignalCardProps {
  signal: {
    id: string;
    title: string;
    sourceType: string;
    scrapedAt: Date;
    company: {
      id: string;
      name: string;
    };
    analyses: Array<{
      confidence: number;
      sentiment: string;
      agentPersona: AgentPersona;
    }>;
  };
  agentPersona?: AgentPersona;
}

const agentLabels: Record<AgentPersona, string> = {
  ANALYST: "The Analyst",
  GOSSIP_GIRL: "Gossip Girl",
};

export function FeedSignalCard({ signal, agentPersona }: FeedSignalCardProps) {
  const formattedDate = new Date(signal.scrapedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const analysis = agentPersona
    ? signal.analyses.find((a) => a.agentPersona === agentPersona)
    : signal.analyses[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
    >
      <Card className="hover:bg-muted/50 transition-colors">
        <CardHeader>
          {agentPersona && (
            <Badge
              variant={agentPersona === "ANALYST" ? "default" : "accent"}
              className="mb-2 w-fit"
            >
              {agentLabels[agentPersona]}
            </Badge>
          )}
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-lg">
              <Link
                href={`/signals/${signal.id}`}
                className="hover:underline"
              >
                {signal.title}
              </Link>
            </CardTitle>
            <Metadata className="whitespace-nowrap">{formattedDate}</Metadata>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/companies/${signal.company.id}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                {signal.company.name}
              </Badge>
            </Link>
            <Badge variant="secondary">{signal.sourceType}</Badge>
            {analysis && (
              <>
                <ConfidenceBand confidence={analysis.confidence} />
                <SentimentIndicator
                  sentiment={analysis.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
