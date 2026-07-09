"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Activity,
  ShieldCheck,
  Cpu,
  Gauge,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeSeriesPoint {
  date: string;
  signalsScraped: number;
  signalsAnalyzed: number;
  signalsRejected: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgConfidence: number | null;
  avgAnalysisLatencyMs: number | null;
}

interface CurrentDay {
  date: string;
  signalsScraped: number;
  signalsAnalyzed: number;
  signalsRejected: number;
  duplicatesSkipped: number;
  qualityGatePassRate: number | null;
  clusterAnalyses: number;
  standaloneAnalyses: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalLlmCalls: number;
  avgConfidence: number | null;
  medianConfidence: number | null;
  avgAnalysisLatencyMs: number | null;
  p95AnalysisLatencyMs: number | null;
  avgGroundingScore: number | null;
  totalFactsRejected: number;
}

interface OverviewResponse {
  timeSeries: TimeSeriesPoint[];
  currentDay: CurrentDay | null;
  totals: {
    signalsScraped: number;
    signalsAnalyzed: number;
    signalsRejected: number;
    duplicatesSkipped: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalLlmCalls: number;
    clusterAnalyses: number;
    standaloneAnalyses: number;
    totalFactsRejected: number;
    avgConfidence: number | null;
    avgAnalysisLatencyMs: number | null;
    daysWithData: number;
  };
}

interface RoutingResponse {
  routingBreakdown: Array<{
    date: string;
    clusterAnalyses: number;
    standaloneAnalyses: number;
  }>;
  avgClusterSimilarity: number | null;
  avgTokensPerPath: {
    cluster: { avgTokensIn: number; avgTokensOut: number };
    standalone: { avgTokensIn: number; avgTokensOut: number };
  };
}

interface SourceTypeEntry {
  sourceType: string;
  count: number;
  avgConfidence: number | null;
  avgGroundingScore: number | null;
  totalTokens: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold font-serif">{value}</p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Chart Wrapper ────────────────────────────────────────────────────────────

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function MetricsClient() {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [sourceTypes, setSourceTypes] = useState<SourceTypeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, routingRes] = await Promise.all([
        fetch(`/api/v1/admin/metrics/overview?days=${d}`),
        fetch(`/api/v1/admin/metrics/routing?days=${d}`),
      ]);

      if (!overviewRes.ok || !routingRes.ok) {
        throw new Error("Failed to fetch metrics data");
      }

      const overviewData: OverviewResponse = await overviewRes.json();
      const routingData: RoutingResponse = await routingRes.json();

      setOverview(overviewData);
      setRouting(routingData);

      // Derive source type breakdown from bySourceType in currentDay or from timeSeries
      // The overview API doesn't expose bySourceType directly, so we build it from
      // the quality API's source type data if available, or show empty.
      // For now, we fetch the quality endpoint for source breakdown.
      const qualityRes = await fetch(`/api/v1/admin/metrics/quality?days=${d}`);
      if (qualityRes.ok) {
        const qualityData = await qualityRes.json();
        // quality API doesn't have source breakdown; we'll show a placeholder
        // until the overview API is extended. For now, use empty array.
        setSourceTypes(qualityData.bySourceType ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchData is a legitimate data fetching pattern
    fetchData(days);
  }, [days, fetchData]);

  const cd = overview?.currentDay;
  const ts = overview?.timeSeries ?? [];
  // Charts look best with oldest-first
  const tsChronological = [...ts].reverse();

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Summary card skeletons */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Chart skeletons */}
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive font-medium">Error loading metrics</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const hasData = overview && overview.totals.daysWithData > 0;

  if (!hasData) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">No metrics data yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline metrics will appear here once signals have been analyzed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalRouting =
    (cd?.clusterAnalyses ?? 0) + (cd?.standaloneAnalyses ?? 0);

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Time range:</span>
        <Select
          value={String(days)}
          onValueChange={(v) => setDays(Number(v))}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          icon={Activity}
          title="Signals Today"
          value={fmt(cd?.signalsScraped)}
          sub={`${fmt(cd?.signalsAnalyzed)} analyzed · ${fmt(cd?.signalsRejected)} rejected`}
        />
        <SummaryCard
          icon={ShieldCheck}
          title="Quality Gate Pass"
          value={pct(cd?.qualityGatePassRate)}
          sub={`${fmt(cd?.totalFactsRejected)} facts rejected`}
        />
        <SummaryCard
          icon={Cpu}
          title="Tokens Used Today"
          value={fmt((cd?.totalTokensIn ?? 0) + (cd?.totalTokensOut ?? 0))}
          sub={`${fmt(cd?.totalTokensIn)} in · ${fmt(cd?.totalTokensOut)} out`}
        />
        <SummaryCard
          icon={Gauge}
          title="Avg Confidence"
          value={fmt(cd?.avgConfidence, 2)}
          sub={`median ${fmt(cd?.medianConfidence, 2)}`}
        />
        <SummaryCard
          icon={Clock}
          title="Avg Latency"
          value={`${fmt(cd?.avgAnalysisLatencyMs)} ms`}
          sub={`p95 ${fmt(cd?.p95AnalysisLatencyMs)} ms`}
        />
      </div>

      {/* ── Time Series Charts (2×2) ─────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Signals volume */}
        <ChartCard title="Signals Volume Over Time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tsChronological}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(v: ReactNode) => String(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="signalsScraped"
                name="Scraped"
                stroke="hsl(var(--chart-c1))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="signalsAnalyzed"
                name="Analyzed"
                stroke="hsl(var(--chart-c2))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="signalsRejected"
                name="Rejected"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Token usage */}
        <ChartCard title="Token Usage Over Time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tsChronological}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(v: ReactNode) => String(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="totalTokensIn"
                name="Input"
                stroke="hsl(var(--chart-c3))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="totalTokensOut"
                name="Output"
                stroke="hsl(var(--chart-c4))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Confidence */}
        <ChartCard title="Avg Confidence Over Time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tsChronological}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(v: ReactNode) => String(v)}
              />
              <Line
                type="monotone"
                dataKey="avgConfidence"
                name="Avg Confidence"
                stroke="hsl(var(--chart-c5))"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Latency */}
        <ChartCard title="Avg Analysis Latency Over Time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tsChronological}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} unit=" ms" />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(v: ReactNode) => String(v)}
                formatter={(value) => [`${fmt(Number(value))} ms`, "Latency"]}
              />
              <Line
                type="monotone"
                dataKey="avgAnalysisLatencyMs"
                name="Avg Latency"
                stroke="hsl(var(--chart-c6))"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Routing Breakdown ─────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Routing Breakdown (Today)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-chart-c2" />
                  <span className="text-sm font-medium">Cluster</span>
                </div>
                <span className="text-lg font-bold font-serif">
                  {fmt(cd?.clusterAnalyses)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-chart-c3" />
                  <span className="text-sm font-medium">Standalone</span>
                </div>
                <span className="text-lg font-bold font-serif">
                  {fmt(cd?.standaloneAnalyses)}
                </span>
              </div>
              {/* Visual ratio bar */}
              {totalRouting > 0 && (
                <div className="pt-2">
                  <div className="flex h-3 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-chart-c2 transition-all"
                      style={{
                        width: `${((cd?.clusterAnalyses ?? 0) / totalRouting) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-chart-c3 transition-all"
                      style={{
                        width: `${((cd?.standaloneAnalyses ?? 0) / totalRouting) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {((cd?.clusterAnalyses ?? 0) / totalRouting * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {((cd?.standaloneAnalyses ?? 0) / totalRouting * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Cluster Similarity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-2xl font-bold font-serif">
                  {fmt(routing?.avgClusterSimilarity, 3)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Average embedding similarity for cluster matches
                </p>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-2">Avg Tokens per Path</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Cluster</p>
                    <p className="text-sm font-semibold">
                      {fmt(routing?.avgTokensPerPath.cluster.avgTokensIn)}{" "}
                      <span className="text-muted-foreground font-normal">in</span>{" "}
                      /{" "}
                      {fmt(routing?.avgTokensPerPath.cluster.avgTokensOut)}{" "}
                      <span className="text-muted-foreground font-normal">out</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Standalone</p>
                    <p className="text-sm font-semibold">
                      {fmt(routing?.avgTokensPerPath.standalone.avgTokensIn)}{" "}
                      <span className="text-muted-foreground font-normal">in</span>{" "}
                      /{" "}
                      {fmt(routing?.avgTokensPerPath.standalone.avgTokensOut)}{" "}
                      <span className="text-muted-foreground font-normal">out</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Source Type Breakdown ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Source Type Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceTypes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Avg Confidence</TableHead>
                  <TableHead className="text-right">Avg Grounding</TableHead>
                  <TableHead className="text-right">Total Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceTypes.map((row) => (
                  <TableRow key={row.sourceType}>
                    <TableCell className="font-medium">
                      {row.sourceType}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(row.count)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(row.avgConfidence, 2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(row.avgGroundingScore, 2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(row.totalTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No source type breakdown data available yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
