"use client";

import { useEffect, useState, memo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Activity,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { logger } from "@/lib/logger";

// Types
interface DailyTokenMetric {
  date: string;
  tokens: number;
}

interface DailyCostMetric {
  date: string;
  cost: number;
}

interface ToolStats {
  count: number;
  successRate: number;
}

interface MetricsData {
  tokenUsage: {
    total: number;
    promptTokens: number;
    completionTokens: number;
    daily: DailyTokenMetric[];
    byModel: Record<string, number>;
  };
  toolCalls: {
    total: number;
    successful: number;
    failed: number;
    byTool: Record<string, ToolStats>;
  };
  sessions: {
    total: number;
    active: number;
    avgDuration: number;
    byStatus: Record<string, number>;
  };
  estimatedCost: {
    total: number;
    daily: DailyCostMetric[];
  };
}

interface DeepAgentMetricsProps {
  sessionId?: string | null;
}

// Memoized chart components for performance
const TokenUsageChart = memo(({ data }: { data: DailyTokenMetric[] }) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data} aria-label="Daily token usage chart">
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis
        dataKey="date"
        className="text-xs"
        tick={{ fontSize: 12 }}
        tickFormatter={(value) => {
          const date = new Date(value);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }}
      />
      <YAxis className="text-xs" tick={{ fontSize: 12 }} />
      <Tooltip
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "var(--radius)",
        }}
        labelFormatter={(value) => new Date(value).toLocaleDateString()}
      />
      <Legend />
      <Line
        type="monotone"
        dataKey="tokens"
        stroke="hsl(var(--chart-c1))"
        strokeWidth={2}
        name="Tokens"
        dot={{ fill: "hsl(var(--chart-c1))", r: 4 }}
        activeDot={{ r: 6 }}
      />
    </LineChart>
  </ResponsiveContainer>
));
TokenUsageChart.displayName = "TokenUsageChart";

const CostChart = memo(({ data }: { data: DailyCostMetric[] }) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data} aria-label="Daily cost chart">
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis
        dataKey="date"
        className="text-xs"
        tick={{ fontSize: 12 }}
        tickFormatter={(value) => {
          const date = new Date(value);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }}
      />
      <YAxis
        className="text-xs"
        tick={{ fontSize: 12 }}
        tickFormatter={(value) => `$${value.toFixed(2)}`}
      />
      <Tooltip
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "var(--radius)",
        }}
        labelFormatter={(value) => new Date(value).toLocaleDateString()}
        formatter={(value) => [`$${Number(value).toFixed(2)}`, "Cost"]}
      />
      <Legend />
      <Line
        type="monotone"
        dataKey="cost"
        stroke="hsl(var(--chart-c2))"
        strokeWidth={2}
        name="Cost (USD)"
        dot={{ fill: "hsl(var(--chart-c2))", r: 4 }}
        activeDot={{ r: 6 }}
      />
    </LineChart>
  </ResponsiveContainer>
));
CostChart.displayName = "CostChart";

const ToolCallsChart = memo(
  ({ data }: { data: Array<{ name: string; success: number; failed: number }> }) => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} aria-label="Tool calls success/failure chart">
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis className="text-xs" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
          }}
        />
        <Legend />
        <Bar
          dataKey="success"
          stackId="a"
          fill="hsl(var(--success))"
          name="Successful"
        />
        <Bar
          dataKey="failed"
          stackId="a"
          fill="hsl(var(--destructive))"
          name="Failed"
        />
      </BarChart>
    </ResponsiveContainer>
  )
);
ToolCallsChart.displayName = "ToolCallsChart";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function DeepAgentMetrics({ sessionId }: DeepAgentMetricsProps) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(7);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchMetricsAsync = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (sessionId) params.append("sessionId", sessionId);

        const response = await fetch(`/api/v1/admin/deepagent/metrics?${params}`, {
credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.message || "Failed to fetch metrics");
        }

        const data: MetricsData = await response.json();
        setMetrics(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        logger.error("deepagent.metrics.fetch_error", { error: String(err) });
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    };

    fetchMetricsAsync();

    return () => controller.abort();
  }, [sessionId, days, retryKey]);

  // Prepare tool calls data for chart
  const toolCallsData = metrics
    ? Object.entries(metrics.toolCalls.byTool)
        .map(([name, stats]) => ({
          name,
          success: Math.round(stats.count * stats.successRate),
          failed: Math.round(stats.count * (1 - stats.successRate)),
        }))
        .sort((a, b) => (b.success + b.failed) - (a.success + a.failed))
        .slice(0, 10) // Top 10 tools
    : [];

  // Prepare model breakdown data
  const modelData = metrics
    ? Object.entries(metrics.tokenUsage.byModel)
        .map(([model, tokens]) => ({ model, tokens }))
        .sort((a, b) => b.tokens - a.tokens)
    : [];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <p className="font-medium">{error}</p>
          </div>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="mt-2 text-sm text-muted-foreground hover:text-foreground underline"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Performance Metrics</h2>
        <Select
          value={days.toString()}
          onValueChange={(value) => setDays(parseInt(value || "7", 10))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(metrics.tokenUsage.total)}</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(metrics.tokenUsage.promptTokens)} in / {formatNumber(metrics.tokenUsage.completionTokens)} out
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tool Calls</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(metrics.toolCalls.total)}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3 w-3" />
                {metrics.toolCalls.successful}
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="h-3 w-3" />
                {metrics.toolCalls.failed}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.sessions.total}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.sessions.active} active • Avg: {formatDuration(metrics.sessions.avgDuration)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.estimatedCost.total.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Based on token usage and model pricing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="tokens" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tokens">Token Usage</TabsTrigger>
          <TabsTrigger value="tools">Tool Calls</TabsTrigger>
          <TabsTrigger value="cost">Cost</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Token Usage</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.tokenUsage.daily.length > 0 ? (
                <TokenUsageChart data={metrics.tokenUsage.daily} />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  No token usage data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tool Call Success Rates</CardTitle>
            </CardHeader>
            <CardContent>
              {toolCallsData.length > 0 ? (
                <ToolCallsChart data={toolCallsData} />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  No tool call data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tool details table */}
          {Object.keys(metrics.toolCalls.byTool).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tool Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(metrics.toolCalls.byTool)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .slice(0, 10)
                    .map(([name, stats]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                      >
                        <span className="font-medium">{name}</span>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{stats.count} calls</Badge>
                          <Badge
                            variant={stats.successRate >= 0.9 ? "default" : "secondary"}
                            className={
                              stats.successRate >= 0.9
                                ? "bg-success text-success-foreground"
                                : ""
                            }
                          >
                            {(stats.successRate * 100).toFixed(1)}% success
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Cost Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.estimatedCost.daily.length > 0 ? (
                <CostChart data={metrics.estimatedCost.daily} />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  No cost data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Token Usage by Model</CardTitle>
            </CardHeader>
            <CardContent>
              {modelData.length > 0 ? (
                <div className="space-y-3">
                  {modelData.map(({ model, tokens }) => {
                    const percentage = (tokens / metrics.tokenUsage.total) * 100;
                    return (
                      <div key={model} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{model}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {formatNumber(tokens)} tokens
                            </span>
                            <Badge variant="outline">{percentage.toFixed(1)}%</Badge>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                  No model usage data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Session status breakdown */}
      {Object.keys(metrics.sessions.byStatus).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Session Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(metrics.sessions.byStatus).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <span className="capitalize text-sm font-medium">{status}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
