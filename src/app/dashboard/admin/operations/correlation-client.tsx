"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Radar, RefreshCw, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

interface CorrelationStatus {
  lastRunAt: string | null;
  lastDuration: number | null;
  lastResults: {
    themesUpdated: number;
    inferencesCreated: number;
    debatesCreated: number;
    clusterArticlesCreated: number;
  } | null;
}

interface CorrelationClientProps {
  initialStatus?: CorrelationStatus;
}

export function CorrelationClient({ initialStatus }: CorrelationClientProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [status, setStatus] = useState<CorrelationStatus | null>(
    initialStatus ?? null,
  );

  const handleRun = async () => {
    setIsRunning(true);
    setIsDialogOpen(false);

    try {
      const res = await fetch("/api/v1/admin/correlation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "async" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || data.error || "Failed to trigger correlation",
        );
      }

      toast.success("Correlation pipeline started", {
        description: `Job ID: ${data.jobId}`,
        duration: 5000,
      });

      // Update last run status optimistically
      setStatus((prev) => ({
        lastRunAt: new Date().toISOString(),
        lastDuration: null,
        lastResults: prev?.lastResults ?? null,
      }));
    } catch (err) {
      toast.error("Failed to start correlation", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const formatLastRun = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  };

  return (
    <Card className="border-2 border-foreground">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4" />
            <CardTitle className="text-base">Signal Clustering</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {status?.lastRunAt && (
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {formatLastRun(status.lastRunAt)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Cluster signals by theme, generate cross-signal inferences, run dual-agent
          debates, and create synthesis articles. Runs daily at 4:00 AM UTC.
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-primary font-medium">
                  Running...
                </span>
              </>
            ) : status?.lastResults ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {status.lastResults.themesUpdated} themes
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {status.lastResults.inferencesCreated} inferences
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {status.lastResults.debatesCreated} debates
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {status.lastResults.clusterArticlesCreated} articles
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                No runs yet
              </span>
            )}
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger
              className="inline-flex shrink-0 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 py-1"
              disabled={isRunning}
            >
              <Radar className="h-3.5 w-3.5 mr-1.5" />
              Run Now
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Run Signal Clustering</DialogTitle>
                <DialogDescription>
                  This will cluster all recent signals by theme, generate inferences
                  for convergent patterns, run dual-agent debates, and create synthesis
                  articles. The pipeline typically takes 2-3 minutes to complete.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-3">
                <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">
                      What will happen:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Cluster themes across recent analyses</li>
                      <li>Create/update SignalTheme records with momentum</li>
                      <li>Generate inferences for high-convergence themes</li>
                      <li>Run dual-agent debates (Analyst vs Gossip Girl)</li>
                      <li>Generate cluster synthesis articles</li>
                    </ul>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isRunning}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRun}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Radar className="h-4 w-4 mr-2" />
                      Start Clustering
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
