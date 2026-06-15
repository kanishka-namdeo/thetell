"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";

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
  "#737373",
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

  useEffect(() => {
    const fetchBreakdown = async () => {
      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (companyId) params.append("companyId", companyId);

        const res = await fetch(`/api/v1/analytics/overview?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const json = await res.json();
        setData(json.sourceBreakdown || []);
      } catch (error) {
        console.error("Error fetching source breakdown:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBreakdown();
  }, [companyId, days]);

  if (loading) {
    return (
      <ChartCard title="Signal Sources" description="Signals by source type">
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          Loading...
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
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
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
