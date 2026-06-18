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
interface SignalTableProps {
  signals: Array<{
    id: string;
    sourceType: string;
    title: string;
    scrapedAt: Date | string;
    status: string;
    company: { name: string; ticker: string | null };
    analyses: Array<{ sentiment: string; confidence: number }>;
  }>;
  loading?: boolean;
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Signal</TableHead>
          <TableHead className="hidden md:table-cell">Company</TableHead>
          <TableHead className="hidden lg:table-cell">Source</TableHead>
          <TableHead className="hidden lg:table-cell">Status</TableHead>
          <TableHead>Sentiment</TableHead>
          <TableHead className="hidden md:table-cell">Confidence</TableHead>
          <TableHead className="hidden sm:table-cell">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <AnimatePresence mode="popLayout">
          {signals.map((signal) => (
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
                  className="font-serif text-sm font-medium hover:underline"
                >
                  {signal.title}
                </Link>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">
                  {signal.company.name}
                  {signal.company.ticker && ` (${signal.company.ticker})`}
                </Badge>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {sourceTypeLabels[signal.sourceType] || signal.sourceType}
                </span>
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
                {signal.analyses[0] ? (
                  <SentimentIndicator
                    sentiment={signal.analyses[0].sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL"}
                    showLabel={false}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {signal.analyses[0] ? (
                  <ConfidenceBadge confidence={signal.analyses[0].confidence} />
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
          ))}
        </AnimatePresence>
      </TableBody>
    </Table>
  );
}
