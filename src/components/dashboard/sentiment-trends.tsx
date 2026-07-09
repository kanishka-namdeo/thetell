"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { logger } from "@/lib/logger";

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
  const { status } = useSession();
  const [data, setData] = useState<SentimentTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(status === "loading");
      if (status === "unauthenticated") {
        setError("Authentication required. Please sign in.");
      }
      return;
    }

    const controller = new AbortController();
    const fetchTrends = async () => {
      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (companyId) params.append("companyId", companyId);

        const res = await fetch(`/api/v1/analytics/overview?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
          logger.error("analytics.sentiment.fetch.error", {
            status: res.status,
            statusText: res.statusText,
            error: errorData,
          });

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
        setData(json.sentimentTrends || []);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setLoading(false);
          return;
        }
        logger.error("analytics.sentiment.fetch.error", { error: String(err) });
        setError("Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
    return () => controller.abort();
  }, [companyId, days, status]);

  if (!mounted || loading) {
    return (
      <ChartCard title="Sentiment Trends" description="Signal sentiment over time">
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          {loading ? "Loading..." : null}
        </div>
      </ChartCard>
    );
  }

  if (error) {
    return (
      <ChartCard title="Sentiment Trends" description="Signal sentiment over time">
        <div className="h-[300px] flex items-center justify-center text-destructive text-sm">
          {error}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Sentiment Trends" description="Signal sentiment over time">
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
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
              stroke="var(--chart-success)"
              strokeWidth={2}
              dot={false}
              name="Positive"
            />
            <Line
              type="monotone"
              dataKey="negative"
              stroke="var(--chart-destructive)"
              strokeWidth={2}
              dot={false}
              name="Negative"
            />
            <Line
              type="monotone"
              dataKey="neutral"
              stroke="var(--neutral-500)"
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
