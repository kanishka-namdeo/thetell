"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { WatchlistButton } from "@/components/dashboard/watchlist-button";

interface CompanyCardProps {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  description: string | null;
  signalCount: number;
  articleCount: number;
  isWatched?: boolean;
}

export function CompanyCard({
  id,
  name,
  slug,
  ticker,
  description,
  signalCount,
  articleCount,
  isWatched = false,
}: CompanyCardProps) {
  return (
    <Card className="hard-shadow-hover transition-all">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{name}</CardTitle>
            {ticker && (
              <Badge variant="outline" className="mt-1 font-mono">
                {ticker}
              </Badge>
            )}
          </div>
          <WatchlistButton
            companyId={id}
            isWatched={isWatched}
            onToggle={() => {}}
          />
        </div>
      </CardHeader>
      <CardContent>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-3 font-body">
            {description}
          </p>
        )}
        <div className="flex gap-4 mt-3 text-xs font-mono text-muted-foreground">
          <span>{signalCount} signals</span>
          <span>{articleCount} articles</span>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Link href={`/dashboard/companies/${id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            View Details
          </Button>
        </Link>
        <Link href={`/dashboard/signals?companyId=${id}`}>
          <Button variant="ghost" size="icon-sm" aria-label="View signals">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
