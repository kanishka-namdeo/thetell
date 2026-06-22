import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";

export async function TrendingThemes() {
  // Try SignalTheme table first (from correlation engine)
  const signalThemes = await prisma.signalTheme.findMany({
    where: {
      status: { in: ["ACCELERATING", "EMERGING"] },
    },
    include: {
      company: { select: { id: true, name: true, ticker: true } },
      _count: { select: { signals: true, inferences: true } },
    },
    orderBy: { momentum: "desc" },
    take: 10,
  });

  // If we have correlation engine themes, show those
  if (signalThemes.length > 0) {
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
            {signalThemes.map((theme, index) => (
              <Link
                key={theme.id}
                href={`/inferences/${theme.id}`}
                className={`flex items-start gap-3 border-b border-border/50 pb-2 hover:bg-muted/50 px-1 -mx-1 transition-colors ${index === signalThemes.length - 1 ? "border-b-0 pb-0" : ""}`}
              >
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {theme.momentum > 0.3 ? (
                    <TrendingUp className="h-3 w-3 text-success" />
                  ) : theme.momentum < -0.3 ? (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  ) : (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {theme.label}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {theme.company.name}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {theme._count.signals} signals
                    </span>
                  </div>
                </div>
                <Badge
                  variant={theme.status === "ACCELERATING" ? "default" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {theme.status.toLowerCase()}
                </Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fallback: extract themes from analyses
  const highConfidenceAnalyses = await prisma.analysis.findMany({
    where: { confidence: { gte: 0.7 } },
    select: { strategicThemes: true },
  });

  const themeCounts = new Map<string, number>();

  for (const analysis of highConfidenceAnalyses) {
    if (!Array.isArray(analysis.strategicThemes)) continue;

    for (const theme of analysis.strategicThemes) {
      const label =
        typeof theme === "object" && theme !== null && "label" in theme
          ? (theme as { label: string }).label
          : String(theme);
      themeCounts.set(label, (themeCounts.get(label) || 0) + 1);
    }
  }

  const topThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topThemes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Trending Themes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No trending themes yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Trending Themes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topThemes.map(([theme, count], index) => (
            <div
              key={theme}
              className={`flex items-center justify-between border-b border-border/50 pb-2 ${index === topThemes.length - 1 ? "border-b-0 pb-0" : ""}`}
            >
              <Badge
                variant="outline"
                className="text-xs truncate max-w-[70%]"
              >
                {theme}
              </Badge>
              <span className="text-sm font-mono">{count}</span>
            </div>
          ))}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Total themes
              </span>
              <span className="text-sm font-mono font-semibold">
                {themeCounts.size}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
