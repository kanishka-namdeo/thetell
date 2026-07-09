"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  Database,
  Sparkles,
  Search,
  Brain,
  GitBranch,
  AlertTriangle,
  ChevronDown,
  X,
} from "lucide-react";
import { PipelineStageCard, type StageStatus } from "./PipelineStageCard";
import { PipelineFlowDiagram } from "./PipelineFlowDiagram";
import type { MetricItem } from "./StageMetrics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { PipelineChatModal } from "@/components/admin/pipeline-chat-modal";
import { useRouter } from "next/navigation";

interface SecondaryTrigger {
  label: string;
  confirmation: string;
  endpoint: string;
}

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  icon: typeof Database;
  status: StageStatus;
  lastRun: string | null;
  metrics: MetricItem[];
  triggerLabel: string;
  triggerConfirmation: string;
  triggerEndpoint: string;
  secondaryTrigger?: SecondaryTrigger;
}

interface ControlCenterClientProps {
  initialStages?: PipelineStage[];
}

const defaultStages: PipelineStage[] = [
  {
    id: "source-discovery",
    name: "Source Discovery",
    description: "Discover new data sources via MCP servers",
    icon: Search,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Total Sources", value: 0 },
      { label: "Pending", value: 0 },
      { label: "Verified", value: 0 },
    ],
    triggerLabel: "Discover Sources",
    triggerConfirmation:
      "This will open the interactive source discovery modal. Continue?",
    triggerEndpoint: "",
    secondaryTrigger: {
      label: "View Session History",
      confirmation: "Navigate to the pipeline sessions page?",
      endpoint: "/dashboard/admin/operations/pipelines",
    },
  },
  {
    id: "sources",
    name: "Source Health",
    description: "Health checks for configured data sources",
    icon: Database,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Total Sources", value: 0 },
      { label: "Healthy", value: 0 },
      { label: "Failed", value: 0 },
    ],
    triggerLabel: "Run Health Check",
    triggerConfirmation:
      "This will check the health of all configured data sources. Continue?",
    triggerEndpoint: "/api/v1/admin/sources/health-check",
  },
  {
    id: "enrichment",
    name: "Enrichment",
    description: "Company data enrichment",
    icon: Sparkles,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Enriched", value: 0 },
      { label: "Pending", value: 0 },
    ],
    triggerLabel: "Re-enrich Companies",
    triggerConfirmation:
      "This will re-enrich all company data from external sources. Continue?",
    triggerEndpoint: "/api/v1/admin/enrichment/run",
  },
  {
    id: "discovery",
    name: "Discovery",
    description: "Signal discovery from sources",
    icon: Search,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Discovered (24h)", value: 0 },
      { label: "Pending", value: 0 },
    ],
    triggerLabel: "Run Discovery",
    triggerConfirmation:
      "This will discover new signals from all configured sources. Continue?",
    triggerEndpoint: "/api/v1/admin/discovery/run",
    secondaryTrigger: {
      label: "Scrape Only (No Analysis)",
      confirmation:
        "This will scrape signals WITHOUT triggering LLM analysis. Useful for batch collection. Continue?",
      endpoint: "/api/v1/admin/discovery/run?scrapeOnly=true",
    },
  },
  {
    id: "analysis",
    name: "Analysis",
    description: "AI signal analysis",
    icon: Brain,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Analyzed", value: 0 },
      { label: "Pending", value: 0 },
      { label: "Avg Confidence", value: "0%" },
    ],
    triggerLabel: "Re-analyze All",
    triggerConfirmation:
      "This will re-analyze ALL signals (pending, failed, and already analyzed). This may take several minutes. Continue?",
    triggerEndpoint: "/api/v1/admin/analysis/run",
    secondaryTrigger: {
      label: "Analyze New Only",
      confirmation:
        "This will analyze only NEW signals that haven't been processed yet (pending status). Continue?",
      endpoint: "/api/v1/admin/analysis/run?scope=new",
    },
  },
  {
    id: "correlation",
    name: "Correlation",
    description: "Cross-signal correlation",
    icon: GitBranch,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Themes", value: 0 },
      { label: "Inferences", value: 0 },
    ],
    triggerLabel: "Run Correlation",
    triggerConfirmation:
      "This will analyze correlations between signals and generate strategic inferences. Continue?",
    triggerEndpoint: "/api/v1/admin/correlation/run",
    secondaryTrigger: {
      label: "Correlate Recent (24h)",
      confirmation:
        "This will correlate only signals from the last 24 hours. Continue?",
      endpoint: "/api/v1/admin/correlation/run?recentOnly=true",
    },
  },
];

export function ControlCenterClient({
  initialStages,
}: ControlCenterClientProps) {
  const router = useRouter();
  const [stages, setStages] = useState<PipelineStage[]>(
    initialStages || defaultStages
  );
  const [triggeringStages, setTriggeringStages] = useState<Set<string>>(
    new Set()
  );
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
  const [healthResults, setHealthResults] = useState<{
    checked: number;
    succeeded: number;
    failed: number;
    sources: Array<{
      id: string;
      url: string;
      sourceType: string;
      companyName: string;
      isActive: boolean;
      httpStatusCode: number | null;
      failureReason: string | null;
      consecutiveFailures: number;
      status: "healthy" | "failed";
    }>;
  } | null>(null);
  const [enrichDialogOpen, setEnrichDialogOpen] = useState(false);
  const [enrichCompanyId, setEnrichCompanyId] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchStats() {
      try {
        const response = await fetch("/api/v1/admin/control-center", {
          credentials: "include",
          signal: controller.signal,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        const data = await response.json();
        
        // Transform API response to PipelineStage format
        const transformedStages = defaultStages.map((stage) => {
          const apiStage = data.stages?.[stage.id];
          if (!apiStage) return stage;

          const metrics: MetricItem[] = [];
          
          // Map API metrics to MetricItem array based on stage
          if (stage.id === "source-discovery" && apiStage.metrics) {
            metrics.push(
              { label: "Total Sources", value: apiStage.metrics.totalSources || 0 },
              { label: "Pending", value: apiStage.metrics.pendingSources || 0 },
              { label: "Verified", value: apiStage.metrics.verifiedSources || 0 }
            );
          } else if (stage.id === "sources" && apiStage.metrics) {
            metrics.push(
              { label: "Total Sources", value: apiStage.metrics.totalSources || 0 },
              { label: "Healthy", value: apiStage.metrics.healthySources || 0 },
              { label: "Failed", value: apiStage.metrics.failedSources || 0 }
            );
          } else if (stage.id === "enrichment" && apiStage.metrics) {
            metrics.push(
              { label: "Enriched", value: apiStage.metrics.companiesEnriched || 0 },
              { label: "Pending", value: apiStage.metrics.pendingEnrichment || 0 }
            );
          } else if (stage.id === "discovery" && apiStage.metrics) {
            metrics.push(
              { label: "Discovered (24h)", value: apiStage.metrics.signalsDiscovered24h || 0 },
              { label: "Pending", value: apiStage.metrics.signalsPending || 0 }
            );
          } else if (stage.id === "analysis" && apiStage.metrics) {
            metrics.push(
              { label: "Analyzed", value: apiStage.metrics.signalsAnalyzed || 0 },
              { label: "Pending", value: apiStage.metrics.signalsPending || 0 },
              { label: "Avg Confidence", value: `${Math.round((apiStage.metrics.avgConfidence || 0) * 100)}%` }
            );
          } else if (stage.id === "correlation" && apiStage.metrics) {
            metrics.push(
              { label: "Themes", value: apiStage.metrics.themesDetected || 0 },
              { label: "Inferences", value: apiStage.metrics.inferencesGenerated || 0 }
            );
          }

          // Normalize API status to StageStatus union
          const rawStatus = apiStage.status || "idle";
          const normalizedStatus: StageStatus =
            rawStatus === "running"
              ? "running"
              : rawStatus === "error"
                ? "error"
                : rawStatus === "recently_completed" || rawStatus === "completed"
                  ? "recent"
                  : "idle";

          return {
            ...stage,
            status: normalizedStatus,
            lastRun: apiStage.lastRun || null,
            metrics: metrics.length > 0 ? metrics : stage.metrics,
          };
        });

        setStages(transformedStages);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        logger.error("control_center.fetch_error", { error: String(error) });
        toast.error("Failed to load pipeline stats");
        // Keep default stages if fetch fails
      }
    }

    fetchStats();

    return () => {
      controller.abort();
    };
  }, []);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  async function handleTrigger(stageId: string, endpoint: string) {
    setTriggeringStages((prev) => new Set(prev).add(stageId));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let errorMessage = `Failed to trigger ${stageId}`;
        try {
          const errorBody = await response.json();
          if (errorBody.message) {
            errorMessage = errorBody.message;
          } else if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // Response might not be JSON, use status text
          errorMessage = `${errorMessage}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      toast.success(`${stageId} triggered successfully`);

      setStages((prev) =>
        prev.map((stage) =>
          stage.id === stageId
            ? {
                ...stage,
                status: "running" as StageStatus,
                lastRun: new Date().toISOString(),
                metrics: stage.metrics.map((m) =>
                  m.label === "Running" ? { ...m, value: 1 } : m
                ),
              }
            : stage
        )
      );

      if (result.data) {
        logger.debug("control_center.trigger_result", { stageId, data: result.data });
      }

      if (stageId === "sources") {
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch("/api/v1/admin/sources/health-check/results", { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              if (data.checked > 0) {
                setHealthResults(data);
                clearInterval(pollInterval);
              }
            }
          } catch {}
        }, 3000);
        pollIntervalRef.current = pollInterval;
        const timeout = setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
        pollTimeoutRef.current = timeout;
      }
    } catch (error) {
      logger.error("control_center.trigger_error", { stageId, error: String(error) });
      toast.error(
        error instanceof Error ? error.message : "Failed to trigger stage"
      );
    } finally {
      setTriggeringStages((prev) => {
        const next = new Set(prev);
        next.delete(stageId);
        return next;
      });
    }
  }

  async function handleEnrichCompany() {
    if (!enrichCompanyId.trim()) {
      toast.error("Please enter a company ID");
      return;
    }

    try {
      const response = await fetch("/api/v1/admin/enrichment/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ companyId: enrichCompanyId }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to enrich company";
        try {
          const errorBody = await response.json();
          if (errorBody.message) {
            errorMessage = errorBody.message;
          } else if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          errorMessage = `${errorMessage}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      toast.success(`Company ${enrichCompanyId} enrichment started`);
      setEnrichDialogOpen(false);
      setEnrichCompanyId("");
    } catch (error) {
      logger.error("control_center.enrich_error", { error: String(error) });
      toast.error(
        error instanceof Error ? error.message : "Failed to enrich company"
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold mb-2">Pipeline Stages</h2>
        <p className="text-sm text-muted-foreground">
          Monitor and trigger each stage of the signal processing pipeline
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex flex-col gap-4">
            <PipelineStageCard
              name={stage.name}
              description={stage.description}
              icon={stage.icon}
              status={stage.status}
              lastRun={stage.lastRun}
              metrics={stage.metrics}
              triggerLabel={stage.triggerLabel}
              triggerConfirmation={stage.triggerConfirmation}
              onTrigger={
                stage.id === "source-discovery"
                  ? async () => setDiscoveryModalOpen(true)
                  : () => handleTrigger(stage.id, stage.triggerEndpoint)
              }
              secondaryTrigger={stage.secondaryTrigger}
              onSecondaryTrigger={
                stage.id === "enrichment"
                  ? async () => setEnrichDialogOpen(true)
                  : stage.id === "source-discovery"
                    ? async () => router.push("/dashboard/admin/operations/pipelines")
                    : stage.secondaryTrigger
                      ? async () => handleTrigger(stage.id, stage.secondaryTrigger!.endpoint)
                      : undefined
              }
              isTriggering={triggeringStages.has(stage.id)}
            />
            {stage.id === "sources" && healthResults && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span className="font-semibold text-sm">Health Check Results</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHealthResults(null)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm text-muted-foreground mb-3">
                    Checked {healthResults.checked} sources:{" "}
                    <Badge variant="default" className="bg-success text-success-foreground">
                      {healthResults.succeeded} healthy
                    </Badge>{" "}
                    <Badge variant="destructive">
                      {healthResults.failed} failed
                    </Badge>
                  </div>
                  {healthResults.failed > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md hover:bg-accent">
                        <span>View Failed Sources</span>
                        <ChevronDown className="h-4 w-4" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-2">
                        {healthResults.sources
                          .filter((s) => s.status === "failed")
                          .map((source) => (
                            <div
                              key={source.id}
                              className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{source.companyName}</span>
                                <Badge variant="outline" className="text-xs">
                                  {source.sourceType}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground break-all">
                                {source.url}
                              </div>
                              {source.failureReason && (
                                <div className="text-xs text-destructive">
                                  {source.failureReason}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Consecutive failures: {source.consecutiveFailures}
                              </div>
                            </div>
                          ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            )}
            {index < stages.length - 1 && (
              <PipelineFlowDiagram stageCount={2} />
            )}
          </div>
        ))}
      </div>

      <Dialog open={enrichDialogOpen} onOpenChange={setEnrichDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enrich Specific Company</DialogTitle>
            <DialogDescription>
              Enter the company ID to enrich
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Company ID (e.g. abc123...)"
              value={enrichCompanyId}
              onChange={(e) => setEnrichCompanyId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEnrichCompany();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEnrichDialogOpen(false);
                setEnrichCompanyId("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEnrichCompany}>
              Enrich Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PipelineChatModal
        open={discoveryModalOpen}
        onOpenChange={setDiscoveryModalOpen}
      />    </div>
  );
}
