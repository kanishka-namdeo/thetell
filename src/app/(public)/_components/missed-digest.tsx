"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Metadata } from "@/components";
import { Sparkles } from "lucide-react";

interface MissedDigestProps {
  count: number;
  lastVisit: string;
  topCompanies: Array<{ name: string; count: number }>;
}

export function MissedDigest({ count, lastVisit, topCompanies }: MissedDigestProps) {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    // Update cookie to current time after displaying
    document.cookie = `last_visit=${new Date().toISOString()}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);

  if (count === 0) {
    return null;
  }

  const lastVisitDate = new Date(lastVisit);
  const formattedDate = lastVisitDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="border-2 border-foreground">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-foreground" />
            <CardTitle className="text-base">What You Missed</CardTitle>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isOpen ? "Hide" : "Show"}
          </button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="pt-0">
          <Metadata className="mb-3">
            {count} new signal{count !== 1 ? "s" : ""} since {formattedDate}
          </Metadata>
          {topCompanies.length > 0 && (
            <div className="space-y-2">
              <Metadata>Top companies:</Metadata>
              <div className="flex flex-wrap gap-1.5">
                {topCompanies.map(({ name, count: companyCount }) => (
                  <Badge key={name} variant="outline" className="text-[11px]">
                    {name} ({companyCount})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
