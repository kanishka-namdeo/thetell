"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ExternalLink, AlertCircle, CheckCircle2, Clock, Zap } from "lucide-react";

interface ObservabilityStatus {
  enabled: boolean;
  baseUrl: string;
  health: {
    status: string;
    version: string;
  } | null;
  stats: {
    traces24h: number;
    generations24h: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export function ObservabilityTab() {
  const [status, setStatus] = useState<ObservabilityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/admin/observability/status");
      if (!res.ok) throw new Error("Failed to fetch observability status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Observability Error</CardTitle>
          </div>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchStatus} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  if (!status.enabled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <CardTitle>LLM Observability</CardTitle>
          </div>
          <CardDescription>
            Langfuse is not enabled. Set <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">LANGFUSE_ENABLED=true</code> in your environment to enable tracing.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isHealthy = status.health?.status === "OK";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <CardTitle>Langfuse Status</CardTitle>
              <Badge variant={isHealthy ? "default" : "destructive"}>
                {isHealthy ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              render={<a href={status.baseUrl} target="_blank" rel="noopener noreferrer" />}
            >
              Open Langfuse UI
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            {isHealthy
              ? `Langfuse v${status.health?.version} is running at ${status.baseUrl}`
              : `Cannot connect to Langfuse at ${status.baseUrl}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              label="Traces (24h)"
              value={status.stats.traces24h.toLocaleString()}
            />
            <MetricCard
              icon={<Zap className="h-4 w-4 text-muted-foreground" />}
              label="Generations (24h)"
              value={status.stats.generations24h.toLocaleString()}
            />
            <MetricCard
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              label="Tokens Used"
              value={formatNumber(status.stats.totalTokens)}
            />
            <MetricCard
              icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              label="Est. Cost (24h)"
              value={`$${status.stats.estimatedCost.toFixed(2)}`}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What's Being Traced</CardTitle>
          <CardDescription>
            Every LLM call in the pipeline is automatically traced via the provider abstraction layer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Fact extraction, sentiment analysis, theme identification
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Dual-agent analysis (Analyst + Gossip Girl personas)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Article generation (headline, summary, body)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Cross-signal debate and correlation
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Hypothesis generation and calibration
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Company enrichment (social discovery, ticker lookup)
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
