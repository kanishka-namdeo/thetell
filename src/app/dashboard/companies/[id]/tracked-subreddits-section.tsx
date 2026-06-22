"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackedSubreddit {
  id: string;
  subreddit: string;
  reason: string | null;
  isActive: boolean;
  discoveredAt: Date;
  lastValidatedAt: Date;
}

interface TrackedSubredditsSectionProps {
  subreddits: TrackedSubreddit[];
  companyId: string;
  isAdmin: boolean;
}

export function TrackedSubredditsSection({
  subreddits,
  companyId,
  isAdmin,
}: TrackedSubredditsSectionProps) {
  const [discovering, setDiscovering] = useState(false);

  const activeSubreddits = subreddits.filter((s) => s.isActive);
  const lastDiscovery =
    subreddits.length > 0
      ? new Date(
          Math.max(
            ...subreddits.map((s) => new Date(s.discoveredAt).getTime())
          )
        )
      : null;

  async function handleRediscover() {
    setDiscovering(true);
    try {
      const res = await fetch(
        `/api/v1/companies/${companyId}/subreddits/discover`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error("Failed to trigger discovery");
      }
    } catch {
      // Silently handle — user can retry
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-lg">Tracked Subreddits</CardTitle>
            {activeSubreddits.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeSubreddits.length}
              </Badge>
            )}
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRediscover}
              disabled={discovering}
            >
              <RefreshCw
                className={cn("h-3 w-3 mr-1", discovering && "animate-spin")}
              />
              Re-discover
            </Button>
          )}
        </div>
        {lastDiscovery && (
          <p className="text-xs text-muted-foreground font-body">
            Last discovery: {lastDiscovery.toLocaleDateString()}{" "}
            {lastDiscovery.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {activeSubreddits.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeSubreddits.map((sub) => (
              <a
                key={sub.id}
                href={`https://www.reddit.com/r/${sub.subreddit}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Badge
                  variant="outline"
                  className="gap-1 cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  r/{sub.subreddit}
                  <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </Badge>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground font-body">
            No subreddits discovered yet.
            {isAdmin &&
              " Click \"Re-discover\" to find relevant subreddits for this company."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
