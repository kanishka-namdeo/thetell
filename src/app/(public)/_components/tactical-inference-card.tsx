"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBand } from "@/components/dashboard/confidence-band";
import { Metadata } from "@/components";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Newspaper,
  FileText,
  Mic,
  MessageCircle,
  Briefcase,
  BookOpen,
  Megaphone,
  Globe,
  type LucideIcon,
} from "lucide-react";

interface TacticalInferenceCardProps {
  inference: {
    id: string;
    title: string;
    hypothesis: string;
    confidence: number;
    status: string;
    createdAt: string;
    sourceTypesInvolved: string[];
    company: { id: string; name: string; ticker: string | null };
    theme: { id: string; label: string; status: string; momentum: number } | null;
    _count: { articles: number };
  };
}

const SOURCE_ICON_MAP: Record<string, LucideIcon> = {
  NEWS: Newspaper,
  FILING: FileText,
  TRANSCRIPT: Mic,
  SOCIAL: MessageCircle,
  JOB_POSTING: Briefcase,
  BLOG: BookOpen,
  PRESS_RELEASE: Megaphone,
};

const STATUS_BORDER_MAP: Record<string, string> = {
  EMERGING: "border-muted-foreground",
  DEVELOPING: "border-primary",
  CONFIRMED: "border-success",
  REFUTED: "border-destructive",
};

const STATUS_BADGE_MAP: Record<string, "outline" | "default" | "accent" | "destructive"> = {
  EMERGING: "outline",
  DEVELOPING: "default",
  CONFIRMED: "accent",
  REFUTED: "destructive",
};

function formatRelativeTime(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TacticalInferenceCard({ inference }: TacticalInferenceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const borderClass = STATUS_BORDER_MAP[inference.status] ?? "border-muted-foreground";
  const badgeVariant = STATUS_BADGE_MAP[inference.status] ?? "outline";

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("button")) return;
    setIsExpanded((prev) => !prev);
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
    >
      <div
        onClick={handleCardClick}
        className={cn(
          "cursor-pointer border-l-4 bg-card p-4 transition-colors hover:bg-muted/30",
          borderClass
        )}
      >
        {/* Tier 1: Always visible */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline">
            {inference.company.name}
            {inference.company.ticker && (
              <span className="ml-1 text-muted-foreground">({inference.company.ticker})</span>
            )}
          </Badge>
          <Badge variant={badgeVariant}>{inference.status}</Badge>
          <ConfidenceBand confidence={inference.confidence} />
          <Metadata className="ml-auto">{formatRelativeTime(inference.createdAt)}</Metadata>
        </div>

        <Link
          href={`/inferences/${inference.id}`}
          className="block mb-1"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-serif font-bold text-lg hover:underline">
            {inference.title}
          </h3>
        </Link>

        <p className={cn("text-muted-foreground", !isExpanded && "line-clamp-2")}>
          {inference.hypothesis}
        </p>

        {/* Evidence row */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            {inference.sourceTypesInvolved.map((type) => {
              const Icon = SOURCE_ICON_MAP[type] ?? Globe;
              return (
                <Icon key={type} className="size-3.5 text-muted-foreground" />
              );
            })}
          </div>
          <Metadata>
            {inference.sourceTypesInvolved.length} signal{inference.sourceTypesInvolved.length !== 1 && "s"}
          </Metadata>
          {inference.theme && (
            <Badge variant="theme" className="text-[10px]">
              {inference.theme.label}
            </Badge>
          )}
        </div>

        {/* Tier 2: Expanded on click */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-foreground/10 mt-3 pt-3 space-y-3">
                <p className="text-foreground">{inference.hypothesis}</p>

                <Metadata>KEY EVIDENCE</Metadata>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/inferences/${inference.id}`}>
                    <Button variant="outline" size="sm">
                      View Full Analysis
                    </Button>
                  </Link>
                  {inference._count.articles > 0 && (
                    <Link href={`/inferences/${inference.id}#articles`}>
                      <Button variant="outline" size="sm">
                        View Evidence Chain
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
