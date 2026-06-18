import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components";

export async function TrendingThemes() {
  const highConfidenceAnalyses = await prisma.analysis.findMany({
    where: {
      confidence: { gte: 0.7 },
    },
    select: {
      strategicThemes: true,
    },
  });

  // Extract and count themes across all analyses
  const themeCounts = new Map<string, number>();

  for (const analysis of highConfidenceAnalyses) {
    if (!Array.isArray(analysis.strategicThemes)) continue;

    for (const theme of analysis.strategicThemes) {
      const label = typeof theme === "object" && theme !== null && "label" in theme
        ? (theme as { label: string }).label
        : String(theme);

      themeCounts.set(label, (themeCounts.get(label) || 0) + 1);
    }
  }

  // Sort by count and take top 10
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
          <p className="text-sm text-muted-foreground">No trending themes yet</p>
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
          {topThemes.map(([theme, count]) => (
            <div key={theme} className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {theme}
              </Badge>
              <span className="text-sm font-mono">{count}</span>
            </div>
          ))}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total themes</span>
              <span className="text-sm font-mono font-semibold">{themeCounts.size}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
