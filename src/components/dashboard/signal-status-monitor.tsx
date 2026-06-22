"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileText } from "lucide-react";
import { AnalysisDetail } from "@/components/dashboard/analysis-detail";
import { AnalysisData } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

interface SignalStatusMonitorProps {
  signalId: string;
  initialStatus: string;
  initialAnalysis: AnalysisData | null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60;

export function SignalStatusMonitor({
  signalId,
  initialStatus,
  initialAnalysis,
}: SignalStatusMonitorProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(initialAnalysis);
  const [polling, setPolling] = useState(initialStatus === "ANALYZING" || initialStatus === "PENDING");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const pollStatus = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(`/api/v1/signals/${signalId}`, { signal: controller.signal });
      if (!res.ok) return;

      const data = await res.json();
      setStatus(data.status);

      if (data.analysis) {
        setAnalysis({
          id: data.analysis.id,
          signalId: data.analysis.signalId,
          summary: data.analysis.summary,
          keyFacts: (data.analysis.keyFacts as AnalysisData["keyFacts"]) ?? [],
          sentiment: data.analysis.sentiment,
          strategicThemes: (data.analysis.strategicThemes as AnalysisData["strategicThemes"]) ?? [],
          confidence: data.analysis.confidence,
          modelUsed: data.analysis.modelUsed,
          analyzedAt: data.analysis.analyzedAt instanceof Date
            ? data.analysis.analyzedAt.toISOString()
            : data.analysis.analyzedAt,
        });
      }

      if (data.status === "ANALYZED" || data.status === "FAILED") {
        setPolling(false);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Silently continue polling
    }
  }, [signalId]);

  useEffect(() => {
    if (!polling) return;

    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount >= MAX_POLLS) {
        setPolling(false);
        clearInterval(interval);
        return;
      }
      await pollStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [polling, pollStatus]);

  async function handleReanalyze() {
    setReanalyzing(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/signals/${signalId}/reanalyze`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to re-analyze" }));
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      if (!mountedRef.current) return;
      setStatus("ANALYZING");
      setAnalysis(null);
      setPolling(true);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to re-analyze");
    } finally {
      if (mountedRef.current) setReanalyzing(false);
    }
  }

  async function handleGenerateArticle() {
    if (!analysis) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/articles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisIds: [analysis.id],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to generate article" }));
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      const article = await res.json();
      if (!mountedRef.current) return;
      router.push(`/dashboard/articles/${article.id}`);
      router.refresh();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to generate article");
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="border-2 border-destructive bg-destructive/5 p-4">
          <p className="text-sm text-destructive font-body">{error}</p>
        </div>
      )}

      {/* Status indicator for in-progress signals */}
      {(status === "PENDING" || status === "ANALYZING") && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm font-body font-medium">
                  {status === "PENDING" ? "Waiting for analysis..." : "AI analysis in progress..."}
                </p>
                <p className="text-xs text-muted-foreground font-body mt-1">
                  This page will update automatically when analysis completes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis display */}
      {analysis && status === "ANALYZED" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground">
              AI Analysis
            </p>
            <div className="flex items-center gap-2">
              <Badge
                variant="default"
                className={cn("text-xs")}
              >
                ANALYZED
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateArticle}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3 mr-1" />
                    Generate Article
                  </>
                )}
              </Button>
            </div>
          </div>
          <AnalysisDetail analysis={analysis} />
        </div>
      )}

      {/* Failed status with re-analyze button */}
      {status === "FAILED" && (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-sm text-destructive font-body">
              Analysis failed. The signal could not be processed.
            </p>
            <Button
              variant="outline"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              {reanalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Re-analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-analyze
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending with no analysis */}
      {!analysis && status === "PENDING" && !polling && (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground font-body">
              This signal has not been analyzed yet.
            </p>
            <Button
              variant="outline"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              {reanalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Trigger Analysis
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
