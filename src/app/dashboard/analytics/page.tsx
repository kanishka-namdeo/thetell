import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SentimentTrends } from "@/components/dashboard/sentiment-trends";
import { ConfidenceDistribution } from "@/components/dashboard/confidence-distribution";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const companies = await prisma.company.findMany({
    include: {
      signals: {
        include: {
          analysis: true,
        },
      },
      articles: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const companyStats = companies.map((company) => {
    const signals = company.signals;
    const analyses = signals.filter((s) => s.analysis).map((s) => s.analysis!);

    const avgConfidence =
      analyses.length > 0
        ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
        : 0;

    const sentimentCounts = {
      POSITIVE: analyses.filter((a) => a.sentiment === "POSITIVE").length,
      NEGATIVE: analyses.filter((a) => a.sentiment === "NEGATIVE").length,
      NEUTRAL: analyses.filter((a) => a.sentiment === "NEUTRAL").length,
    };

    const mostRecentSignal = signals.sort(
      (a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()
    )[0];

    return {
      id: company.id,
      name: company.name,
      ticker: company.ticker,
      signalCount: signals.length,
      articleCount: company.articles.length,
      avgConfidence,
      sentimentCounts,
      mostRecentSignalDate: mostRecentSignal?.scrapedAt,
    };
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Analytics
        </p>
        <h1 className="text-3xl font-serif font-bold">Company Comparison</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Compare signals, confidence, and sentiment across companies
        </p>
      </div>

      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Company Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-foreground">
                <TableHead className="font-sans text-xs uppercase tracking-wider">Company</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Signals</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Articles</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Avg Confidence</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Positive</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Negative</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Neutral</TableHead>
                <TableHead className="font-sans text-xs uppercase tracking-wider text-right">Latest Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companyStats.map((company) => (
                <TableRow key={company.id} className="border-border">
                  <TableCell className="font-serif font-medium">
                    {company.name}
                    {company.ticker && (
                      <Badge variant="outline" className="ml-2 text-[9px]">
                        {company.ticker}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{company.signalCount}</TableCell>
                  <TableCell className="text-right font-mono">{company.articleCount}</TableCell>
                  <TableCell className="text-right font-mono">
                    {Math.round(company.avgConfidence * 100)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-600">
                    {company.sentimentCounts.POSITIVE}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    {company.sentimentCounts.NEGATIVE}
                  </TableCell>
                  <TableCell className="text-right font-mono text-neutral-600">
                    {company.sentimentCounts.NEUTRAL}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-muted-foreground">
                    {company.mostRecentSignalDate
                      ? new Date(company.mostRecentSignalDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {companyStats.length === 0 && (
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
