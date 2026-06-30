"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { TacticalFilterBar } from "./tactical-filter-bar";
import { TacticalInferenceCard } from "./tactical-inference-card";
import { TacticalArticleCard } from "./tactical-article-card";
import { SignupPrompt } from "./signup-prompt";
import { EmptyTacticalFeed } from "./empty-tactical-feed";

interface TacticalFeedContentProps {
  inferences: Array<{
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
  }>;
  articles: Array<{
    id: string;
    title: string;
    summary: string;
    publishedAt: string | null;
    agentPersona: "ANALYST" | "GOSSIP_GIRL";
    company: { id: string; name: string; ticker: string | null };
  }>;
  companies: Array<{ id: string; name: string }>;
}

type FeedItem =
  | { type: "inference"; date: string; data: TacticalFeedContentProps["inferences"][number] }
  | { type: "article"; date: string; data: TacticalFeedContentProps["articles"][number] };

interface Filters {
  company: string | null;
  status: string | null;
  sort: string;
}

export function TacticalFeedContent({ inferences, articles, companies }: TacticalFeedContentProps) {
  const [filters, setFilters] = useState<Filters>({
    company: null,
    status: null,
    sort: "recent",
  });

  const filteredItems = useMemo(() => {
    let items: FeedItem[] = [
      ...inferences.map((inf) => ({
        type: "inference" as const,
        date: inf.createdAt,
        data: inf,
      })),
      ...articles
        .filter((art) => art.publishedAt !== null)
        .map((art) => ({
          type: "article" as const,
          date: art.publishedAt!,
          data: art,
        })),
    ];

    if (filters.company) {
      items = items.filter((item) => {
        if (item.type === "inference") return item.data.company.id === filters.company;
        return item.data.company.id === filters.company;
      });
    }

    if (filters.status) {
      items = items.filter((item) => {
        if (item.type === "inference") return item.data.status === filters.status;
        return true;
      });
    }

    switch (filters.sort) {
      case "confidence":
        items.sort((a, b) => {
          const confA = a.type === "inference" ? a.data.confidence : 0;
          const confB = b.type === "inference" ? b.data.confidence : 0;
          return confB - confA;
        });
        break;
      case "signals":
        items.sort((a, b) => {
          const sigA = a.type === "inference" ? a.data.sourceTypesInvolved.length : 0;
          const sigB = b.type === "inference" ? b.data.sourceTypesInvolved.length : 0;
          return sigB - sigA;
        });
        break;
      case "recent":
      default:
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
    }

    return items;
  }, [inferences, articles, filters]);

  return (
    <div className="space-y-6">
      <TacticalFilterBar
        companies={companies}
        onFilterChange={setFilters}
        resultCount={filteredItems.length}
      />

      {filteredItems.length === 0 ? (
        <EmptyTacticalFeed
          hasActiveFilters={filters.company !== null || filters.status !== null || filters.sort !== "recent"}
          onClearFilters={() => setFilters({ company: null, status: null, sort: "recent" })}
        />
      ) : (
        <motion.div
          className="space-y-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 50,
              },
            },
          }}
        >
          {filteredItems.map((item, index) => (
            <motion.div
              key={`${item.type}-${item.data.id}`}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
            >
              {item.type === "inference" ? (
                <TacticalInferenceCard inference={item.data} />
              ) : (
                <TacticalArticleCard article={item.data} />
              )}
              {(index + 1) % 8 === 0 && index < filteredItems.length - 1 && (
                <SignupPrompt />
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
