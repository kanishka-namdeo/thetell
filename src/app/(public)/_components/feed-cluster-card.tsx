"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MomentumArrow } from "./momentum-arrow";
import Link from "next/link";
import { motion } from "motion/react";
import { Layers, TrendingUp } from "lucide-react";

interface FeedClusterCardProps {
  cluster: {
    id: string;
    label: string;
    status: string;
    momentum: number;
    company: {
      id: string;
      name: string;
      ticker: string | null;
    };
    _count: {
      clusteredSignals: number;
    };
  };
}

const STATUS_LABELS: Record<string, string> = {
  EMERGING: "Emerging",
  ACCELERATING: "Accelerating",
};

export function FeedClusterCard({ cluster }: FeedClusterCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={`/clusters/${cluster.id}`}>
        <Card className="border-l-4 border-l-primary hover:bg-muted/50 transition-colors">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {cluster.company.name}
                  </Badge>
                  <Badge
                    variant={cluster.status === "ACCELERATING" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {STATUS_LABELS[cluster.status] ?? cluster.status}
                  </Badge>
                </div>
                <p className="text-sm font-medium line-clamp-2 mb-2">
                  {cluster.label}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {cluster._count.clusteredSignals} signals
                  </span>
                  <MomentumArrow momentum={cluster.momentum} showValue />
                </div>
              </div>
              <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
