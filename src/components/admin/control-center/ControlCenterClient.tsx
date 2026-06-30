"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  Database,
  Sparkles,
  Search,
  Brain,
  GitBranch,
  FileText,
} from "lucide-react";
import { PipelineStageCard, type StageStatus } from "./PipelineStageCard";
import { PipelineFlowDiagram } from "./PipelineFlowDiagram";
import type { MetricItem } from "./StageMetrics";

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
    id: "sources",
    name: "Sources",
    description: "Data source health checks",
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
  },
  {
    id: "articles",
    name: "Articles",
    description: "Article generation",
    icon: FileText,
    status: "idle",
    lastRun: null,
    metrics: [
      { label: "Generated", value: 0 },
      { label: "Pending", value: 0 },
    ],
    triggerLabel: "Generate Articles",
    triggerConfirmation:
      "This will generate articles from analyzed signals. Continue?",
    triggerEndpoint: "/api/v1/admin/articles/generate",
  },
];

export function ControlCenterClient({
  initialStages,
}: ControlCenterClientProps) {
  const [stages, setStages] = useState<PipelineStage[]>(
    initialStages || defaultStages
  );
  const [triggeringStages, setTriggeringStages] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/v1/admin/control-center", {
          credentials: "include",
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
          if (stage.id === "sources" && apiStage.metrics) {
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
          } else if (stage.id === "articles" && apiStage.metrics) {
            metrics.push(
              { label: "Generated", value: apiStage.metrics.articlesGenerated || 0 },
              { label: "Pending", value: apiStage.metrics.articlesPending || 0 }
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
        logger.error("control_center.fetch_error", { error: String(error) });
        toast.error("Failed to load pipeline stats");
        // Keep default stages if fetch fails
      }
    }

    fetchStats();
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
              onTrigger={() => handleTrigger(stage.id, stage.triggerEndpoint)}
              secondaryTrigger={stage.secondaryTrigger}
              onSecondaryTrigger={
                stage.secondaryTrigger
                  ? () => handleTrigger(stage.id, stage.secondaryTrigger!.endpoint)
                  : undefined
              }
              isTriggering={triggeringStages.has(stage.id)}
            />
            {index < stages.length - 1 && (
              <PipelineFlowDiagram stageCount={2} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
