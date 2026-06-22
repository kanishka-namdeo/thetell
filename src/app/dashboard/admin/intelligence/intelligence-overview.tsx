"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Clock,
} from "lucide-react";

interface Inference {
  id: string;
  title: string;
  hypothesis: string;
  confidence: number;
  status: string;
  createdAt: string;
  company: {
    id: string;
    name: string;
    slug: string;
  };
}

interface ThemeStatusDistribution {
  EMERGING: number;
  ACCELERATING: number;
  PEAKED: number;
  FADING: number;
  RESOLVED: number;
}

interface IntelligenceOverviewProps {
  lastRunAt: string | null;
  totalThemes: number;
  themeStatusDistribution: ThemeStatusDistribution;
  activeInferences: number;
  confirmedInferences: number;
  refutedInferences: number;
  calibrationAccuracy: number | null;
  recentInferences: Inference[];
}

const statusColors: Record<string, string> = {
  EMERGING: "default",
  DEVELOPING: "secondary",
  CONFIRMED: "success",
  REFUTED: "destructive",
  RESOLVED: "outline",
};

export function IntelligenceOverview({
  lastRunAt,
  totalThemes,
  themeStatusDistribution,
  activeInferences,
  confirmedInferences,
  refutedInferences,
  calibrationAccuracy,
  recentInferences,
}: IntelligenceOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Engine Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Correlation Run</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastRunAt ? new Date(lastRunAt).toLocaleString() : "Never"}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastRunAt ? "Last run scheduled daily at 4:00 AM UTC" : "No runs yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Themes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalThemes}</div>
            <p className="text-xs text-muted-foreground">
              Strategic themes tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Inferences</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeInferences}</div>
            <p className="text-xs text-muted-foreground">
              Emerging + Developing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calibration Accuracy</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {calibrationAccuracy !== null ? `${calibrationAccuracy.toFixed(1)}%` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {calibrationAccuracy !== null
                ? `${confirmedInferences} confirmed, ${refutedInferences} refuted`
                : "No calibrations yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Theme Status Distribution */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg">Theme Momentum Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Emerging</span>
                <Badge variant="outline">{themeStatusDistribution.EMERGING}</Badge>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div
                  className="h-full bg-info rounded-full"
                  style={{
                    width: `${totalThemes > 0 ? (themeStatusDistribution.EMERGING / totalThemes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Accelerating</span>
                <Badge variant="outline">{themeStatusDistribution.ACCELERATING}</Badge>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div
                  className="h-full bg-success rounded-full"
                  style={{
                    width: `${totalThemes > 0 ? (themeStatusDistribution.ACCELERATING / totalThemes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Peaked</span>
                <Badge variant="outline">{themeStatusDistribution.PEAKED}</Badge>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div
                  className="h-full bg-warning rounded-full"
                  style={{
                    width: `${totalThemes > 0 ? (themeStatusDistribution.PEAKED / totalThemes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Fading</span>
                <Badge variant="outline">{themeStatusDistribution.FADING}</Badge>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div
                  className="h-full bg-muted-foreground/50 rounded-full"
                  style={{
                    width: `${totalThemes > 0 ? (themeStatusDistribution.FADING / totalThemes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Resolved</span>
                <Badge variant="outline">{themeStatusDistribution.RESOLVED}</Badge>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div
                  className="h-full bg-muted-foreground/30 rounded-full"
                  style={{
                    width: `${totalThemes > 0 ? (themeStatusDistribution.RESOLVED / totalThemes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Inferences */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg">Recent Inferences</CardTitle>
        </CardHeader>
        <CardContent>
          {recentInferences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No inferences yet</p>
              <p className="text-sm text-muted-foreground">
                Inferences will appear here as the correlation engine processes signals.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Inference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInferences.map((inf) => (
                  <TableRow key={inf.id}>
                    <TableCell className="font-medium">{inf.company.name}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{inf.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {inf.hypothesis}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[inf.status] as "default" | "secondary" | "destructive"}>
                        {inf.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {(inf.confidence * 100).toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inf.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center flex-col">
              <CheckCircle className="h-8 w-8 text-success mb-2" />
              <div className="text-3xl font-bold">{confirmedInferences}</div>
              <p className="text-sm text-muted-foreground text-center">
                Confirmed Inferences
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center flex-col">
              <XCircle className="h-8 w-8 text-destructive mb-2" />
              <div className="text-3xl font-bold">{refutedInferences}</div>
              <p className="text-sm text-muted-foreground text-center">
                Refuted Inferences
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center flex-col">
              <Target className="h-8 w-8 text-info mb-2" />
              <div className="text-3xl font-bold">
                {calibrationAccuracy !== null ? `${calibrationAccuracy.toFixed(0)}%` : "N/A"}
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Accuracy Rate
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
