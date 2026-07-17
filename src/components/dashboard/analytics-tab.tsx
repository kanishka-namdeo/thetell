"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SentimentTrends } from "@/components/dashboard/sentiment-trends";
import { ConfidenceDistribution } from "@/components/dashboard/confidence-distribution";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";

interface CompanyStats {
  id: string;
  name: string;
  ticker: string | null;
  signalCount: number;
  articleCount: number;
  avgConfidence: number;
  sentimentCounts: {
    POSITIVE: number;
    NEGATIVE: number;
    NEUTRAL: number;
  };
  analystCount: number;
  gossipCount: number;
  analystAvgConfidence: number;
  gossipAvgConfidence: number;
  mostRecentSignalDate: Date | null;
}

function CompanyMetricsTable() {
  const [companyStats, setCompanyStats] = useState<CompanyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/companies?limit=100", { signal: controller.signal, credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch companies");
      const json = await res.json();
      const companies = json.items;

      const stats: CompanyStats[] = companies.map((company: {
        id: string;
        name: string;
        ticker: string | null;
        _count: { signals: number; articles: number };
      }) => ({
        id: company.id,
        name: company.name,
        ticker: company.ticker,
        signalCount: company._count.signals,
        articleCount: company._count.articles,
        avgConfidence: 0,
        sentimentCounts: { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 },
        analystCount: 0,
        gossipCount: 0,
        analystAvgConfidence: 0,
        gossipAvgConfidence: 0,
        mostRecentSignalDate: null,
      }));

      setCompanyStats(stats);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
    return () => controllerRef.current?.abort();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-foreground">
          <TableHead className="font-sans text-xs uppercase tracking-wider">Company</TableHead>
          <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Signals</TableHead>
          <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Articles</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companyStats.map((company) => (
          <TableRow key={company.id} className="border-border">
            <TableCell className="font-serif font-medium">
              {company.name}
              {company.ticker && (
                <Badge variant="outline" className="ml-2 text-[11px]">
                  {company.ticker}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right font-mono">{company.signalCount}</TableCell>
            <TableCell className="text-right font-mono">{company.articleCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AnalyticsTab() {
  return (
    <div className="space-y-6">
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Company Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <CompanyMetricsTable />
          </Suspense>
          {false && (
            <p className="text-sm text-muted-foreground text-center py-8 font-body">
              No companies found. Add companies to see analytics.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SentimentTrends days={30} />
        <ConfidenceDistribution days={30} />
      </div>

      <SourceBreakdown days={30} />
    </div>
  );
}
