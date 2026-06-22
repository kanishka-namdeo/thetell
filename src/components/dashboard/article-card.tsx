"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";

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
    <Card className="hard-shadow-hover transition-all">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 min-w-0">
          <CardTitle className="text-lg leading-tight truncate min-w-0" title={title}>
            {title}
          </CardTitle>
          <Badge variant={status === "PUBLISHED" ? "default" : "outline"} className="shrink-0">
            {status}
          </Badge>
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
      <CardFooter>
        <Link href={`/dashboard/articles/${id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            Read Article
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
