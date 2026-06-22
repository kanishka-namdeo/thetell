"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "./confidence-badge";
import { SentimentIndicator } from "./sentiment-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, ArrowUp, MessageSquare, Globe, Database, User, AlertTriangle, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignalTableProps {
  signals: Array<{
    id: string;
    sourceType: string;
    title: string;
    scrapedAt: Date | string;
    status: string;
    scraperName?: string | null;
    verified?: boolean;
    feedLabel?: string | null;
    dataOrigin?: "SCRAPED" | "BOOTSTRAP" | "SEED" | "MANUAL";
    company: { name: string; ticker: string | null };
    engagement?: unknown;
    analyses: Array<{ sentiment: string; confidence: number; agentPersona?: string }>;
    inferences?: Array<{ id: string }>;
    themes?: Array<{ id: string; label: string }>;
  }>;
  loading?: boolean;
}

function formatScraperName(name: string | null | undefined): string {
  if (!name) return "Unknown";
  return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const dataOriginConfig = {
  SCRAPED: { label: "Scraped", icon: Globe, variant: "outline" as const },
  BOOTSTRAP: { label: "Bootstrap", icon: Database, variant: "secondary" as const },
  MANUAL: { label: "Manual", icon: User, variant: "outline" as const },
  SEED: { label: "Legacy", icon: AlertTriangle, variant: "secondary" as const },
} as const;

function DataOriginBadge({ origin }: { origin: "SCRAPED" | "BOOTSTRAP" | "SEED" | "MANUAL" }) {
  const config = dataOriginConfig[origin] ?? dataOriginConfig.SCRAPED;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={cn("gap-1 text-[10px]", origin === "SEED" && "text-muted-foreground")}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

const sourceTypeLabels: Record<string, string> = {
  NEWS: "News",
  FILING: "Filing",
  TRANSCRIPT: "Transcript",
  SOCIAL: "Social",
  BLOG: "Blog",
  JOB_POSTING: "Job Posting",
};

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  ANALYZING: "Analyzing",
  ANALYZED: "Analyzed",
  FAILED: "Failed",
};

function SocialEngagement({ engagement }: { engagement: unknown }) {
  const eng = engagement as { score?: number | null; comments?: number | null; likes?: number | null; replies?: number | null } | null;
  if (!eng) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
      {(eng.score ?? eng.likes) != null && (
        <span className="inline-flex items-center gap-0.5">
          <ArrowUp className="h-3 w-3" />
          {eng.score ?? eng.likes}
        </span>
      )}
      {eng.comments != null && (
        <span className="inline-flex items-center gap-0.5">
          <MessageSquare className="h-3 w-3" />
          {eng.comments}
        </span>
      )}
    </div>
  );
}

export function SignalTable({ signals, loading }: SignalTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-center py-12 border border-foreground">
        <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground">
          No signals found
        </p>
        <p className="text-sm text-muted-foreground mt-2 font-body">
          Try adjusting your filters or add a new signal.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 lg:mx-0">
      <Table className="min-w-[1200px]">
        <colgroup>
          <col className="w-[300px]" />
          <col className="w-[160px]" />
          <col className="w-[140px]" />
          <col className="w-[90px]" />
          <col className="w-[120px]" />
          <col className="w-[120px]" />
          <col className="w-[60px]" />
          <col className="w-[80px]" />
          <col className="w-[70px]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Signal</TableHead>
            <TableHead className="hidden md:table-cell">Company</TableHead>
            <TableHead className="hidden lg:table-cell">Source</TableHead>
            <TableHead className="hidden lg:table-cell">Status</TableHead>
            <TableHead>Analyst</TableHead>
            <TableHead>Gossip Girl</TableHead>
            <TableHead className="hidden xl:table-cell">Inf</TableHead>
            <TableHead className="hidden xl:table-cell">Themes</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence mode="popLayout">
            {signals.map((signal) => {
              const analystAnalysis = signal.analyses.find(a => a.agentPersona === "ANALYST");
              const gossipAnalysis = signal.analyses.find(a => a.agentPersona === "GOSSIP_GIRL");
              const inferenceCount = signal.inferences?.length ?? 0;
              const themeCount = signal.themes?.length ?? 0;

              return (
                <motion.tr
                  key={signal.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <TableCell>
                    <Link
                      href={`/dashboard/signals/${signal.id}`}
                      className="font-serif text-sm font-medium hover:underline truncate block"
                      title={signal.title}
                    >
                      {signal.title}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs font-medium truncate block" title={signal.company.name}>
                      {signal.company.name}
                      {signal.company.ticker && <span className="text-muted-foreground"> ({signal.company.ticker})</span>}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                          {sourceTypeLabels[signal.sourceType] || signal.sourceType}
                        </span>
                        {signal.sourceType === "SOCIAL" && signal.engagement != null && (
                          <SocialEngagement engagement={signal.engagement} />
                        )}
                      </div>
                      {signal.dataOrigin && (
                        <div className="flex items-center gap-1">
                          <DataOriginBadge origin={signal.dataOrigin} />
                          {signal.verified && (
                            <span title="Verified">
                              <BadgeCheck className="h-3 w-3 text-primary" />
                            </span>
                          )}
                        </div>
                      )}
                      {signal.scraperName && (
                        <span className="text-[10px] text-muted-foreground" title={`Scraper: ${signal.scraperName}`}>
                          {formatScraperName(signal.scraperName)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant={
                        signal.status === "ANALYZED"
                          ? "default"
                          : signal.status === "FAILED"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {statusLabels[signal.status] || signal.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {analystAnalysis ? (
                      <div className="flex flex-col items-start gap-1">
                        <SentimentIndicator
                          sentiment={analystAnalysis.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                          showLabel={false}
                        />
                        <ConfidenceBadge confidence={analystAnalysis.confidence} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {gossipAnalysis ? (
                      <div className="flex flex-col items-start gap-1">
                        <SentimentIndicator
                          sentiment={gossipAnalysis.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                          showLabel={false}
                        />
                        <ConfidenceBadge confidence={gossipAnalysis.confidence} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {inferenceCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-mono">
                        <Layers className="h-3 w-3" />
                        {inferenceCount}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {themeCount > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {themeCount} theme{themeCount !== 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(signal.scrapedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </TableCell>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}
