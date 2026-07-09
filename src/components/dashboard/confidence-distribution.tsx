"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { logger } from "@/lib/logger";

interface ConfidenceBucket {
  bucket: string;
  count: number;
}

interface ConfidenceDistributionProps {
  companyId?: string;
  days?: number;
}

const BUCKET_COLORS = ["var(--chart-success)", "var(--neutral-500)", "var(--chart-destructive)"];

export function ConfidenceDistribution({ companyId, days = 30 }: ConfidenceDistributionProps) {
  const [data, setData] = useState<ConfidenceBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchDistribution = async () => {
      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (companyId) params.append("companyId", companyId);

        const res = await fetch(`/api/v1/analytics/overview?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
          logger.error("analytics.confidence.fetch.error", {
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
        setData(json.confidenceDistribution || []);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setLoading(false);
          return;
        }
        logger.error("analytics.confidence.fetch.error", { error: String(err) });
        setError("Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchDistribution();
    return () => controller.abort();
  }, [companyId, days]);

  if (!mounted || loading) {
    return (
      <ChartCard title="Confidence Distribution" description="Analysis confidence score breakdown">
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          {loading ? "Loading..." : null}
        </div>
      </ChartCard>
    );
  }

  if (error) {
    return (
      <ChartCard title="Confidence Distribution" description="Analysis confidence score breakdown">
        <div className="h-[300px] flex items-center justify-center text-destructive text-sm">
          {error}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Confidence Distribution" description="Analysis confidence score breakdown">
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="bucket"
              stroke="var(--muted-foreground)"
              style={{ fontSize: "10px", fontFamily: "var(--font-sans)" }}
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
            <Bar dataKey="count">
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index % BUCKET_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
