import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Users,
  BarChart3,
  Building2,
  ShieldCheck,
  Server,
  Flag,
  Activity,
  Brain,
} from "lucide-react";
import Link from "next/link";

export interface AdminOverviewData {
  totalUsers: number;
  totalSignals: number;
  totalArticles: number;
  totalCompanies: number;
  usersToday: number;
  activeUsers: number;
  activeInferences: number;
  confirmedHypotheses: number;
  failedPipelineRuns: number;
  runningPipelineRuns: number;
  activeClusterCount: number;
  recentInferences: Array<{
    id: string;
    title: string;
    status: string;
    confidence: number;
    createdAt: Date;
    company: { id: string; name: string; slug: string };
  }>;
  themeStatusMap: Record<string, number>;
  calibrationAccuracy: number | null;
  calibratedInferences: number;
  correctCalibrations: number;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    createdAt: Date;
    user: { name: string | null; email: string | null };
  }>;
}

interface AdminOverviewTabProps {
  data: AdminOverviewData;
}

export function AdminOverviewTab({ data }: AdminOverviewTabProps) {
  const {
    totalUsers,
    totalSignals,
    totalArticles,
    totalCompanies,
    usersToday,
    activeUsers,
    activeInferences,
    confirmedHypotheses,
    failedPipelineRuns,
    runningPipelineRuns,
    activeClusterCount,
    recentInferences,
    themeStatusMap,
    calibrationAccuracy,
    calibratedInferences,
    recentAuditLogs,
  } = data;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={totalUsers}
          description={`${activeUsers} active`}
          icon="Users"
        />
        <StatCard
          title="New Today"
          value={usersToday}
          description="Signups since midnight"
          icon="Activity"
        />
        <StatCard
          title="Signals"
          value={totalSignals}
          description="Total tracked"
          icon="BarChart3"
        />
        <StatCard
          title="Articles"
          value={totalArticles}
          description="Published reports"
          icon="FileText"
        />
        <StatCard
          title="Active Clusters"
          value={activeClusterCount}
          description="Emerging + Accelerating"
          icon="Layers"
        />
        <StatCard
          title="Active Inferences"
          value={activeInferences}
          description="Emerging + Developing"
          icon="Brain"
        />
        <StatCard
          title="Confirmed Hypotheses"
          value={confirmedHypotheses}
          description="Validated predictions"
          icon="Activity"
        />
      </div>

      {/* Pipeline Health */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5" />
              Pipeline Health
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Real-time status
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Failed Runs</span>
                <Badge variant="destructive">{failedPipelineRuns}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Pipeline runs that encountered errors
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Running Now</span>
                <Badge variant="secondary">{runningPipelineRuns}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Currently executing pipelines
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intelligence Activity */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Intelligence Activity
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Last 5 inferences
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {recentInferences.length === 0 ? (
            <p className="text-sm text-muted-foreground font-body">
              No recent inferences yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentInferences.map((inference) => (
                <div
                  key={inference.id}
                  className="flex items-start justify-between border-l-2 border-foreground pl-3 py-1"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{inference.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inference.company.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {inference.status}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {(inference.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                  </div>
                  <time className="text-xs font-mono text-muted-foreground whitespace-nowrap ml-4">
                    {new Date(inference.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Theme Distribution */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Theme Distribution
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              By status
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(themeStatusMap).map(([status, count]) => (
              <div key={status} className="space-y-1">
                <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
                  {status}
                </p>
                <p className="text-2xl font-serif font-bold">{count}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Calibration Accuracy */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Calibration Accuracy
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Prediction accuracy
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <p className="text-2xl font-serif font-bold">
              {calibrationAccuracy !== null
                ? `${calibrationAccuracy.toFixed(1)}%`
                : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              {calibratedInferences > 0
                ? `Based on ${calibratedInferences} calibrated predictions`
                : "No calibrated predictions yet"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/admin/settings/users">
          <Card className="hover:bg-muted transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 border-2 border-foreground flex items-center justify-center">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-serif font-medium">User Management</p>
                  <p className="text-xs text-muted-foreground">
                    Manage roles & access
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/operations">
          <Card className="hover:bg-muted transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 border-2 border-foreground flex items-center justify-center">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-serif font-medium">Operations</p>
                  <p className="text-xs text-muted-foreground">
                    Monitor scrapers & jobs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/admin/content">
          <Card className="hover:bg-muted transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 border-2 border-foreground flex items-center justify-center">
                  <Flag className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-serif font-medium">Content</p>
                  <p className="text-xs text-muted-foreground">
                    Review content queue
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 border-2 border-dashed border-muted-foreground flex items-center justify-center">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-serif font-medium text-muted-foreground">
                  Companies
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalCompanies} tracked
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Admin Actions */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Admin Actions
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Last 10 actions
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {recentAuditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground font-body">
              No admin actions recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between border-l-2 border-foreground pl-3 py-1"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {log.action.replace(".", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {log.resource}
                      {log.resourceId && ` • ${log.resourceId.slice(0, 8)}...`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      by {log.user.name || log.user.email || "Unknown"}
                    </p>
                  </div>
                  <time className="text-xs font-mono text-muted-foreground whitespace-nowrap ml-4">
                    {new Date(log.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
                Users
              </p>
              <p className="text-2xl font-serif font-bold">{totalUsers}</p>
              <p className="text-xs text-muted-foreground">
                {activeUsers} active • {totalUsers - activeUsers} suspended
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
                Content
              </p>
              <p className="text-2xl font-serif font-bold">
                {totalSignals + totalArticles}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalSignals} signals • {totalArticles} articles
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
                Companies
              </p>
              <p className="text-2xl font-serif font-bold">{totalCompanies}</p>
              <p className="text-xs text-muted-foreground">
                Organizations tracked
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
