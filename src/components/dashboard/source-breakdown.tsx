"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { logger } from "@/lib/logger";

interface SourceBreakdownData {
  sourceType: string;
  count: number;
}

interface SourceBreakdownProps {
  companyId?: string;
  days?: number;
}

const SOURCE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const SOURCE_LABELS: Record<string, string> = {
  NEWS: "News",
  FILING: "Filing",
  TRANSCRIPT: "Transcript",
  SOCIAL: "Social",
  BLOG: "Blog",
  JOB_POSTING: "Job Posting",
};

export function SourceBreakdown({ companyId, days = 30 }: SourceBreakdownProps) {
  const [data, setData] = useState<SourceBreakdownData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchBreakdown = async () => {
      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (companyId) params.append("companyId", companyId);

        const res = await fetch(`/api/v1/analytics/overview?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
          logger.error("analytics.source_breakdown.fetch.error", {
            status: res.status,
            statusText: res.statusText,
            error: errorData,
          });

          // Handle authentication errors specifically
          if (res.status === 401) {
            setError("Authentication required. Please sign in.");
          } else if (res.status === 403) {
            setError("Access denied.");
          } else {
            setError(`Failed to load data (${res.status})`);
          }
          return;
        }

        const json = await res.json();
        setData(json.sourceBreakdown || []);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setLoading(false);
          return;
        }
        logger.error("analytics.source_breakdown.fetch.error", { error: String(err) });
        setError("Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchBreakdown();
    return () => controller.abort();
  }, [companyId, days]);

  if (!mounted || loading) {
    return (
      <ChartCard title="Signal Sources" description="Signals by source type">
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          {loading ? "Loading..." : ""}
        </div>
      </ChartCard>
    );
  }

  if (error) {
    return (
      <ChartCard title="Signal Sources" description="Signals by source type">
        <div className="h-[300px] flex items-center justify-center text-destructive text-sm">
          {error}
        </div>
      </ChartCard>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    name: SOURCE_LABELS[d.sourceType] || d.sourceType,
  }));

  return (
    <ChartCard title="Signal Sources" description="Signals by source type">
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="count"
              nameKey="name"
              stroke="var(--border)"
              strokeWidth={1}
            >
              {chartData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0",
                fontSize: "12px",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", fontFamily: "var(--font-sans)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
