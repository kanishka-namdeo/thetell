"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminOverviewTab } from "./admin-overview-tab";
import type { AdminOverviewData } from "./admin-overview-tab";
import { AnalyticsClient } from "./analytics-client";
import { AuditLogClient } from "./audit-log-client";

interface AdminDashboardTabsProps {
  overviewData: AdminOverviewData;
}

export function AdminDashboardTabs({ overviewData }: AdminDashboardTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <AdminOverviewTab data={overviewData} />
      </TabsContent>

      <TabsContent value="analytics">
        <AnalyticsClient />
      </TabsContent>

      <TabsContent value="audit">
        <AuditLogClient />
      </TabsContent>
    </Tabs>
  );
}
