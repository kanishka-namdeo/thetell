"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, TrendingUp, Users, FileText, Building2 } from "lucide-react";

interface AnalyticsData {
  overview: {
    totalSignals: number;
    totalArticles: number;
    totalUsers: number;
    totalCompanies: number;
    averageConfidence: number;
  };
  scraperPerformance: Array<{
    sourceType: string;
    signalCount: number;
    successRate: number;
    averageConfidence: number;
  }>;
  aiPerformance: {
    confidenceDistribution: Array<{ range: string; count: number }>;
    sentimentBreakdown: Array<{ sentiment: string; count: number }>;
    modelUsage: Array<{ model: string; count: number }>;
  };
  userEngagement: {
    activeUsers: number;
    newSignups: number;
    averageArticlesPerUser: number;
  };
  contentPerformance: Array<{
    id: string;
    title: string;
    views: number;
    confidence: number;
  }>;
}

export function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");
  const controllerRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/analytics?dateRange=${dateRange}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      const result = await response.json();
      setData(result);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAnalytics();
    return () => controllerRef.current?.abort();
  }, [fetchAnalytics]);

  function handleExportCSV() {
    if (!data) return;

    const csvContent = [
      ["Metric", "Value"].join(","),
      ["Total Signals", data.overview.totalSignals],
      ["Total Articles", data.overview.totalArticles],
      ["Total Users", data.overview.totalUsers],
      ["Total Companies", data.overview.totalCompanies],
      ["Average Confidence", data.overview.averageConfidence.toFixed(3)],
      ["Active Users", data.userEngagement.activeUsers],
      ["New Signups", data.userEngagement.newSignups],
      ["Avg Articles Per User", data.userEngagement.averageArticlesPerUser.toFixed(2)],
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground py-12">
            Failed to load analytics
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxConfidenceCount = Math.max(...data.aiPerformance.confidenceDistribution.map(d => d.count), 1);
  const maxSentimentCount = Math.max(...data.aiPerformance.sentimentBreakdown.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <Select value={dateRange} onValueChange={(value) => { if (value) setDateRange(value); }}>
          <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExportCSV} className="shrink-0">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Signals</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.totalSignals}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.totalArticles}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.totalCompanies}</div>
          </CardContent>
        </Card>
      </div>

      {/* User Engagement */}
      <Card>
        <CardHeader>
          <CardTitle>User Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold">{data.userEngagement.activeUsers}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">New Signups</p>
              <p className="text-2xl font-bold">{data.userEngagement.newSignups}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Articles/User</p>
              <p className="text-2xl font-bold">
                {data.userEngagement.averageArticlesPerUser.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scraper Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Scraper Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.scraperPerformance.map((scraper) => (
              <div key={scraper.sourceType} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{scraper.sourceType}</span>
                  <span className="text-sm text-muted-foreground">
                    {scraper.signalCount} signals
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${scraper.successRate * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {(scraper.successRate * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg confidence: {(scraper.averageConfidence * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confidence Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.aiPerformance.confidenceDistribution.map((item) => (
                <div key={item.range} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.range}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${(item.count / maxConfidenceCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Sentiment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.aiPerformance.sentimentBreakdown.map((item) => (
                <div key={item.sentiment} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{item.sentiment.toLowerCase()}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${(item.count / maxSentimentCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Model Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.aiPerformance.modelUsage.map((model) => (
              <div key={model.model} className="flex items-center justify-between">
                <span className="text-sm font-medium">{model.model}</span>
                <span className="text-sm text-muted-foreground">{model.count} analyses</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Content */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.contentPerformance.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 border-l-2 border-foreground pl-3 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Confidence: {(item.confidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
