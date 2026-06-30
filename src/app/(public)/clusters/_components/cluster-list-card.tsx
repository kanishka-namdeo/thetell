"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Metadata } from "@/components";
import { MomentumArrow } from "@/app/(public)/_components/momentum-arrow";
import Link from "next/link";
import { Layers } from "lucide-react";

interface ClusterListCardProps {
  cluster: {
    id: string;
    label: string;
    status: string;
    momentum: number;
    lastUpdated: string | Date;
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
  PEAKED: "Peaked",
  FADING: "Fading",
  RESOLVED: "Resolved",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent" | "muted"> = {
  EMERGING: "outline",
  ACCELERATING: "default",
  PEAKED: "accent",
  FADING: "secondary",
  RESOLVED: "muted",
};

function formatRelativeDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ClusterListCard({ cluster }: ClusterListCardProps) {
  return (
    <Link href={`/clusters/${cluster.id}`}>
      <Card className="border-2 border-foreground hover:bg-muted/50 transition-colors">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {cluster.company.name}
                </Badge>
                <Badge variant={STATUS_VARIANT[cluster.status] ?? "outline"} className="text-[10px]">
                  {STATUS_LABELS[cluster.status] ?? cluster.status}
                </Badge>
              </div>
              <p className="text-sm font-serif font-medium line-clamp-2 mb-2">
                {cluster.label}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {cluster._count.clusteredSignals} signals
                </span>
                <MomentumArrow momentum={cluster.momentum} showValue />
                <Metadata>{formatRelativeDate(cluster.lastUpdated)}</Metadata>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
