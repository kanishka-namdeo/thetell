"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bookmark } from "lucide-react";
import { logger } from "@/lib/logger";

interface WatchlistButtonProps {
  companyId: string;
  isWatched: boolean;
  onToggle?: (isWatched: boolean) => void;
}

export function WatchlistButton({
  companyId,
  isWatched: initialIsWatched,
  onToggle,
}: WatchlistButtonProps) {
  const [isWatched, setIsWatched] = useState(initialIsWatched);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    const previousState = isWatched;
    setIsWatched(!previousState);
    setIsLoading(true);

    try {
      if (previousState) {
        // Remove from watchlist
        const response = await fetch(`/api/v1/watchlist/${companyId}`, {
credentials: "include",
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to remove from watchlist");
        }
      } else {
        // Add to watchlist
        const response = await fetch("/api/v1/watchlist", {
credentials: "include",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ companyId }),
        });

        if (!response.ok) {
          throw new Error("Failed to add to watchlist");
        }
      }

      onToggle?.(!previousState);
    } catch (error) {
      // Rollback on error
      setIsWatched(previousState);
      logger.error("watchlist.toggle_failed", { companyId, error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={isWatched ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
    >
      <Bookmark className={`h-4 w-4 ${isWatched ? "fill-current" : ""}`} />
      {isWatched ? "Watching" : "Watch"}
    </Button>
  );
}
