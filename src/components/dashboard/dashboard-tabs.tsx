"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { AnalyticsTab } from "./analytics-tab";
import { ArticlesTab } from "./articles-tab";
import type { OverviewData } from "./overview-tab";

interface DashboardTabsProps {
  overviewData: OverviewData;
}

export function DashboardTabs({ overviewData }: DashboardTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="articles">Articles</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab data={overviewData} />
      </TabsContent>

      <TabsContent value="analytics">
        <AnalyticsTab />
      </TabsContent>

      <TabsContent value="articles">
        <ArticlesTab />
      </TabsContent>
    </Tabs>
  );
}
