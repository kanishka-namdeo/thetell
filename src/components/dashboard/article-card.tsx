"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Layers } from "lucide-react";

interface ArticleCardProps {
  id: string;
  title: string;
  slug: string;
  summary: string;
  companyName: string;
  companyTicker: string | null;
  publishedAt: string | null;
  status: "DRAFT" | "PUBLISHED" | "PENDING_REVIEW";
  authorName: string | null;
  sourceSignalId?: string | null;
  cluster?: {
    id: string;
    label: string;
  } | null;
}

export function ArticleCard({
  id,
  title,
  slug,
  summary,
  companyName,
  companyTicker,
  publishedAt,
  status,
  authorName,
  sourceSignalId,
  cluster,
}: ArticleCardProps) {
  const formatDate = (date: string | null) => {
    if (!date) return "Not published";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="hard-shadow-hover transition-all relative overflow-hidden">
      {/* Fold effect in top-right */}
      <div className="absolute top-0 right-0 w-12 h-12 bg-muted/50 border-l border-b border-border transform rotate-45 translate-x-6 -translate-y-6" />
      
      <CardHeader>
        <div className="flex items-start justify-between gap-2 min-w-0">
          <CardTitle className="text-lg leading-tight truncate min-w-0" title={title}>
            {title}
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {authorName && (
              <Badge variant={authorName.includes("Analyst") ? "default" : "secondary"} className="text-[10px]">
                {authorName}
              </Badge>
            )}
            {cluster && (
              <Link href={`/clusters/${cluster.id}`}>
                <Badge variant="accent" className="text-[10px] gap-1 hover:opacity-80">
                  <Layers className="h-3 w-3" />
                  Cluster
                </Badge>
              </Link>
            )}
            <Badge variant={status === "PUBLISHED" ? "default" : "outline"}>
              {status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3 font-body mb-3">
          {summary}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
          <Badge variant="outline" className="font-mono">
            {companyName} {companyTicker && `(${companyTicker})`}
          </Badge>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(publishedAt)}
          </div>
          {authorName && (
            <div className="flex items-center gap-1">
              <span>By {authorName}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <Link href={`/dashboard/articles/${id}`}>
          <Button variant="outline" size="sm">
            Read Article
          </Button>
        </Link>
        {sourceSignalId && (
          <Link href={`/dashboard/signals/${sourceSignalId}`} className="text-xs text-muted-foreground hover:text-foreground">
            View Source Signal
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
