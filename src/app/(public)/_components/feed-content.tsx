"use client";

import { FeedSignalCard } from "./feed-signal-card";
import { SignupPrompt } from "./signup-prompt";
import { EmptyFeed } from "@/components/empty/empty-feed";
import { motion, AnimatePresence } from "motion/react";

interface FeedSignal {
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
    agentPersona: "ANALYST" | "GOSSIP_GIRL";
    sentiment?: string | null;
    sentimentData?: unknown;
    strategicThemes?: unknown;
  }>;
  cluster?: {
    id: string;
    label: string;
    momentum: number;
    _count?: { clusteredSignals: number };
  } | null;
}

interface FeedContentProps {
  signals: FeedSignal[];
}

export function FeedContent({ signals }: FeedContentProps) {
  return (
    <>
      <motion.div
        className="space-y-5"
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
        <AnimatePresence mode="wait">
          {signals.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyFeed />
            </motion.div>
          ) : (
            <motion.div
              key="signals"
              className="space-y-5"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    staggerChildren: 50,
                  },
                },
              }}
            >
              {signals.slice(0, 10).map((signal) => (
                <FeedSignalCard
                  key={signal.id}
                  signal={signal}
                />
              ))}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.3 }}
              >
                <SignupPrompt />
              </motion.div>
              {signals.slice(10).map((signal) => (
                <FeedSignalCard
                  key={signal.id}
                  signal={signal}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
