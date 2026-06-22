"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";

interface ConfidenceBucket {
  bucket: string;
  count: number;
}

interface ConfidenceDistributionProps {
  companyId?: string;
  days?: number;
}

const BUCKET_COLORS = ["var(--chart-success)", "var(--neutral-500)", "var(--chart-destructive)"];

const subscribe = () => () => {};
function getClientSnapshot() { return true; }
function getServerSnapshot() { return false; }

export function ConfidenceDistribution({ companyId, days = 30 }: ConfidenceDistributionProps) {
  const [data, setData] = useState<ConfidenceBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  useEffect(() => {
    const controller = new AbortController();
    const fetchDistribution = async () => {
      try {
        const params = new URLSearchParams({ days: days.toString() });
        if (companyId) params.append("companyId", companyId);

        const res = await fetch(`/api/v1/analytics/overview?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch");

        const json = await res.json();
        setData(json.confidenceDistribution || []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Error fetching confidence distribution:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
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

  return (
    <ChartCard title="Confidence Distribution" description="Analysis confidence score breakdown">
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
