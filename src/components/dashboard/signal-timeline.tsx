"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "./confidence-badge";
import { MomentumIndicator } from "./momentum-indicator";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

type ThemeStatus =
  | "EMERGING"
  | "ACCELERATING"
  | "PEAKED"
  | "FADING"
  | "RESOLVED";

interface TimelineEntry {
  id: string;
  title: string;
  date: string | Date;
  sourceType: string;
  confidence?: number;
  signalId: string;
}

interface ThemeGroup {
  themeId: string;
  label: string;
  status: ThemeStatus;
  momentum: number;
  signals: TimelineEntry[];
}

interface SignalTimelineProps {
  entries: ThemeGroup[];
  className?: string;
  defaultExpanded?: boolean;
}

const sourceTypeLabels: Record<string, string> = {
  NEWS: "News",
  FILING: "Filing",
  TRANSCRIPT: "Transcript",
  SOCIAL: "Social",
  BLOG: "Blog",
  JOB_POSTING: "Jobs",
  RSS: "RSS",
  PATENT: "Patent",
  LITIGATION: "Legal",
  FDA: "FDA",
  CONTRACT: "Contract",
  TECH_SIGNAL: "Tech",
  WEB_ARCHIVE: "Archive",
  LEGISLATION: "Legislation",
  ACADEMIC: "Academic",
  PODCAST: "Podcast",
  CONFERENCE: "Conference",
  PRESS_RELEASE: "Press",
  LOBBYING: "Lobbying",
};

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SignalTimeline({
  entries,
  className,
  defaultExpanded = false,
}: SignalTimelineProps) {
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(
    () => new Set(defaultExpanded ? entries.map((e) => e.themeId) : [])
  );

  const toggleTheme = (themeId: string) => {
    setExpandedThemes((prev) => {
      const next = new Set(prev);
      if (next.has(themeId)) {
        next.delete(themeId);
      } else {
        next.add(themeId);
      }
      return next;
    });
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 border border-border">
        <p className="text-sm uppercase tracking-widest font-sans text-muted-foreground">
          No signals in timeline
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {entries.map((group) => {
        const isExpanded = expandedThemes.has(group.themeId);

        return (
          <div key={group.themeId} className="border border-border">
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-10 h-auto"
              onClick={() => toggleTheme(group.themeId)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <MomentumIndicator
                  momentum={group.momentum}
                  status={group.status}
                  signalCount={group.signals.length}
                  showLabel={false}
                />
                <span className="font-serif text-sm font-semibold text-foreground truncate">
                  {group.label}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {group.signals.length}
                </Badge>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </Button>

            {isExpanded && (
              <div className="border-t border-border">
                {group.signals.map((signal, idx) => (
                  <div
                    key={signal.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors",
                      idx !== group.signals.length - 1 && "border-b border-border/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/signals/${signal.signalId}`}
                        className="text-sm font-body text-foreground hover:underline truncate block"
                        title={signal.title}
                      >
                        {signal.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {formatDate(signal.date)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1.5"
                        >
                          {sourceTypeLabels[signal.sourceType] ||
                            signal.sourceType}
                        </Badge>
                      </div>
                    </div>
                    {signal.confidence != null && (
                      <ConfidenceBadge
                        confidence={signal.confidence}
                        className="shrink-0"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
