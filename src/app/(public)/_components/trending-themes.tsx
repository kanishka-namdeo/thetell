import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { MomentumArrow } from "./momentum-arrow";

interface ThemeData {
  label: string;
  count: number;
  momentum?: number;
}

interface TrendingThemesProps {
  themes: ThemeData[];
  totalThemes?: number;
}

export function TrendingThemes({ themes, totalThemes }: TrendingThemesProps) {
  if (themes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" />
            Trending Themes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No themes found in current signals
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-4 w-4 text-warning" />
          Trending Themes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {themes.map(({ label, count, momentum }, index) => (
            <div
              key={label}
              className={`flex items-center justify-between border-b border-border/50 pb-2 ${index === themes.length - 1 ? "border-b-0 pb-0" : ""}`}
            >
              <Badge
                variant="outline"
                className="text-xs truncate max-w-[70%]"
                title={label}
              >
                {label}
              </Badge>
              <span className="text-sm font-mono shrink-0">{count}</span>
              {momentum !== undefined && <MomentumArrow momentum={momentum} />}
            </div>
          ))}
          {totalThemes !== undefined && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Total themes
                </span>
                <span className="text-sm font-mono font-semibold">
                  {totalThemes}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
