"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";

interface SentimentTrendData {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
}

interface SentimentTrendsProps {
  companyId?: string;
  days?: number;
}

export function SentimentTrends({ companyId, days = 30 }: SentimentTrendsProps) {
  const [data, setData] = useState<SentimentTrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (companyId) params.append("companyId", companyId);

        const res = await fetch(`/api/v1/analytics/overview?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const json = await res.json();
        setData(json.sentimentTrends || []);
      } catch (error) {
        console.error("Error fetching sentiment trends:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
  }, [companyId, days]);

  if (loading) {
    return (
      <ChartCard title="Sentiment Trends" description="Signal sentiment over time">
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Sentiment Trends" description="Signal sentiment over time">
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              stroke="var(--muted-foreground)"
              style={{ fontSize: "10px", fontFamily: "var(--font-sans)" }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              style={{ fontSize: "10px", fontFamily: "var(--font-sans)" }}
            />
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
            <Line
              type="monotone"
              dataKey="positive"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="Positive"
            />
            <Line
              type="monotone"
              dataKey="negative"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name="Negative"
            />
            <Line
              type="monotone"
              dataKey="neutral"
              stroke="#737373"
              strokeWidth={2}
              dot={false}
              name="Neutral"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
