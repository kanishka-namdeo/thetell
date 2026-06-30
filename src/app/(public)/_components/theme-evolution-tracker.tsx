import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Metadata } from "@/components";
import { TrendingUp } from "lucide-react";

interface ThemeData {
  id: string;
  label: string;
  status: string;
  momentum: number;
  _count?: { signals: number };
}

interface ThemeEvolutionTrackerProps {
  themes: ThemeData[];
}

export function ThemeEvolutionTracker({ themes }: ThemeEvolutionTrackerProps) {
  if (themes.length === 0) {
    return null;
  }

  const statuses = ["EMERGING", "ACCELERATING", "PEAKED", "FADING", "RESOLVED"];

  function getStatusColor(status: string): string {
    switch (status) {
      case "EMERGING":
        return "bg-info";
      case "ACCELERATING":
        return "bg-success";
      case "PEAKED":
        return "bg-warning";
      case "FADING":
        return "bg-muted-foreground";
      case "RESOLVED":
        return "bg-muted";
      default:
        return "bg-muted";
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4" />
          <CardTitle className="text-lg">Theme Evolution</CardTitle>
        </div>
        <Metadata>Top themes by momentum</Metadata>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {themes.map((theme) => {
            const currentStatusIndex = statuses.indexOf(theme.status);
            return (
              <div key={theme.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{theme.label}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {theme.status}
                      </Badge>
                      <Metadata>
                        {theme._count?.signals || 0} signals
                      </Metadata>
                    </div>
                  </div>
                  <Metadata className="text-xs font-mono">
                    {theme.momentum.toFixed(2)}
                  </Metadata>
                </div>

                {/* Status stepper */}
                <div className="flex items-center gap-1">
                  {statuses.map((status, index) => (
                    <div
                      key={status}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        index <= currentStatusIndex
                          ? getStatusColor(theme.status)
                          : "bg-muted/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
