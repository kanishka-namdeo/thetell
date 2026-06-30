"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type PipelineStatus = "pending" | "running" | "completed" | "failed" | "no_activity";

interface PipelineData {
  pipelines?: Array<{ status: string }>;
  recentRuns?: Array<{ startedAt?: string; signalsCreated?: number }>;
}

interface PipelineStatusBannerProps {
  companyId: string;
  show: boolean;
}

export function PipelineStatusBanner({ companyId, show }: PipelineStatusBannerProps) {
  const [status, setStatus] = useState<PipelineStatus>("pending");
  const [signalsCreated, setSignalsCreated] = useState(0);
  const [scrapersCompleted, setScrapersCompleted] = useState(0);
  const [totalScrapers, setTotalScrapers] = useState(0);
  const [visible, setVisible] = useState(show);

  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    if (!visible) return;

    let abortController: AbortController | null = null;

    async function checkStatus() {
      abortController?.abort();
      abortController = new AbortController();
      try {
        const res = await fetch(`/api/v1/admin/pipelines/${companyId}`, {
          signal: abortController.signal,
        });
        if (!res.ok) return;

        const data: PipelineData = await res.json();

        const running = data.pipelines?.filter((p) => p.status === "running").length ?? 0;
        const completed = data.pipelines?.filter((p) => p.status === "completed").length ?? 0;
        const total = data.pipelines?.length ?? 0;

        const recentRuns = data.recentRuns ?? [];
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const recentSignals = recentRuns
          .filter((r) => {
            const startedAt = r.startedAt ? new Date(r.startedAt).getTime() : 0;
            return startedAt > fiveMinutesAgo;
          })
          .reduce((sum, r) => sum + (r.signalsCreated ?? 0), 0);

        setSignalsCreated(recentSignals);
        setScrapersCompleted(completed);
        setTotalScrapers(total);

        if (running > 0) {
          setStatus("running");
        } else if (completed > 0 && recentSignals > 0) {
          setStatus("completed");
        } else if (completed > 0 && recentSignals === 0) {
          setStatus("no_activity");
        } else if (data.pipelines?.some((p) => p.status === "failed")) {
          setStatus("failed");
        } else {
          setStatus("pending");
        }
      } catch {
        // Silent fail - will retry on next poll
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 10000);

    const timeout = setTimeout(() => {
      const currentStatus = statusRef.current;
      if (currentStatus === "completed" || currentStatus === "no_activity") {
        setVisible(false);
      }
    }, 5 * 60 * 1000);

    return () => {
      abortController?.abort();
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [companyId, visible]);

  if (!visible) return null;

  const statusConfig = {
    pending: {
      icon: Loader2,
      iconClass: "animate-spin",
      label: "Initializing",
      message: "Signal discovery is starting...",
      variant: "secondary" as const,
    },
    running: {
      icon: Loader2,
      iconClass: "animate-spin",
      label: "Running",
      message: `Scraping signals... ${scrapersCompleted}/${totalScrapers} scrapers completed`,
      variant: "default" as const,
    },
    completed: {
      icon: CheckCircle2,
      iconClass: "",
      label: "Complete",
      message: signalsCreated > 0
        ? `Discovery complete! ${signalsCreated} new signal${signalsCreated !== 1 ? "s" : ""} found`
        : "Discovery complete. No new signals found at this time.",
      variant: "default" as const,
    },
    no_activity: {
      icon: CheckCircle2,
      iconClass: "",
      label: "Complete",
      message: "Discovery complete. No new signals found at this time.",
      variant: "secondary" as const,
    },
    failed: {
      icon: XCircle,
      iconClass: "",
      label: "Failed",
      message: "Some scrapers encountered errors. Check pipeline details.",
      variant: "destructive" as const,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Icon className={`h-5 w-5 text-primary mt-0.5 ${config.iconClass}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-sm">Signal Discovery</p>
                <Badge variant={config.variant} className="text-xs">
                  {config.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{config.message}</p>
              {status === "running" && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {signalsCreated} signal{signalsCreated !== 1 ? "s" : ""} found so far
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisible(false)}
            className="text-xs"
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
