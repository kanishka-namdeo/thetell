"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Metadata } from "@/components";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { FileText } from "lucide-react";
import { ReadingTime } from "./reading-time";

interface TacticalArticleCardProps {
  article: {
    id: string;
    title: string;
    summary: string;
    publishedAt: string | null;
    agentPersona: "ANALYST" | "GOSSIP_GIRL";
    company: { id: string; name: string; ticker: string | null };
    wordCount?: number;
  };
}

function formatArticleDate(date: string | null): string {
  if (!date) return "Unpublished";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TacticalArticleCard({ article }: TacticalArticleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
        className="cursor-pointer bg-muted/20 p-4 transition-colors hover:bg-muted/40"
      >
        {/* Tier 1: Always visible */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline">
            {article.company.name}
            {article.company.ticker && (
              <span className="ml-1 text-muted-foreground">({article.company.ticker})</span>
            )}
          </Badge>
          <Badge variant={article.agentPersona === "ANALYST" ? "analyst" : "gossip"}>
            {article.agentPersona === "ANALYST" ? "Analyst" : "Gossip Girl"}
          </Badge>
          <FileText className="size-3.5 text-muted-foreground" />
          <ReadingTime wordCount={article.wordCount} />
          <Metadata className="ml-auto">{formatArticleDate(article.publishedAt)}</Metadata>
        </div>

        <Link
          href={`/articles/${article.id}`}
          className="block mb-1"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-serif font-bold text-lg hover:underline">
            {article.title}
          </h3>
        </Link>

        <p className={cn("text-muted-foreground", !isExpanded && "line-clamp-2")}>
          {article.summary}
        </p>

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
                <p className="text-foreground">{article.summary}</p>

                <Link href={`/articles/${article.id}`}>
                  <Button variant="outline" size="sm">
                    Read Full Article
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
