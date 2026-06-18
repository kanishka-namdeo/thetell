"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { AgentFilter, type AgentFilterValue } from "./agent-filter";
import { AgentInfoCard } from "./agent-info-card";
import { FeedSignalCard } from "./feed-signal-card";
import { SignupPrompt } from "./signup-prompt";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "motion/react";

type AgentPersona = "ANALYST" | "GOSSIP_GIRL";

interface AnalysisPreview {
  confidence: number;
  sentiment: string;
  agentPersona: AgentPersona;
}

interface FeedSignal {
  id: string;
  title: string;
  sourceType: string;
  scrapedAt: Date;
  company: {
    id: string;
    name: string;
  };
  analyses: AnalysisPreview[];
}

interface FeedContentProps {
  signals: FeedSignal[];
}

export function FeedContent({ signals }: FeedContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const agentFilter = (searchParams.get("agent") || "ALL") as AgentFilterValue;

  const handleFilterChange = (value: AgentFilterValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("agent");
    } else {
      params.set("agent", value);
    }
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const filteredSignals = signals.map((signal) => ({
    ...signal,
    analyses:
      agentFilter === "ALL"
        ? signal.analyses
        : signal.analyses.filter((a) => a.agentPersona === agentFilter),
  })).filter((signal) => signal.analyses.length > 0);

  return (
    <>
      <div className="flex items-start justify-between gap-4 mt-4">
        <AgentFilter value={agentFilter} onValueChange={handleFilterChange} />
        <div className="w-64">
          <AgentInfoCard />
        </div>
      </div>

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
        <AnimatePresence mode="wait">
          {filteredSignals.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    No signals match this filter.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="signals"
              className="space-y-4"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    staggerChildren: 50,
                  },
                },
              }}
            >
              {filteredSignals.slice(0, 10).map((signal) => (
                <motion.div
                  key={signal.id}
                  className="space-y-3"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
                >
                  {signal.analyses.map((analysis) => (
                    <FeedSignalCard
                      key={`${signal.id}-${analysis.agentPersona}`}
                      signal={signal}
                      agentPersona={analysis.agentPersona}
                    />
                  ))}
                </motion.div>
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
              {filteredSignals.slice(10).map((signal) => (
                <motion.div
                  key={signal.id}
                  className="space-y-3"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
                >
                  {signal.analyses.map((analysis) => (
                    <FeedSignalCard
                      key={`${signal.id}-${analysis.agentPersona}`}
                      signal={signal}
                      agentPersona={analysis.agentPersona}
                    />
                  ))}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
