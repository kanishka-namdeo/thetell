"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CompanyWithCounts, AnalysisData } from "@/lib/api/schemas";
import { Loader2, FileText } from "lucide-react";

interface GenerateArticleFormProps {
  companies: CompanyWithCounts[];
  analyses: Array<AnalysisData & { signalId: string }>;
  defaultCompanyId?: string;
  defaultAnalysisIds?: string[];
}

export function GenerateArticleForm({
  companies,
  analyses,
  defaultCompanyId,
  defaultAnalysisIds = [],
}: GenerateArticleFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState(defaultCompanyId || "");
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<string[]>(defaultAnalysisIds);
  const [customHeadline, setCustomHeadline] = useState("");

  function toggleAnalysis(analysisId: string) {
    setSelectedAnalysisIds((prev) =>
      prev.includes(analysisId)
        ? prev.filter((id) => id !== analysisId)
        : [...prev, analysisId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyId) {
      setError("Please select a company.");
      return;
    }

    if (selectedAnalysisIds.length === 0) {
      setError("Please select at least one analysis.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/articles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          analysisIds: selectedAnalysisIds,
          customHeadline: customHeadline || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to generate article" }));
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      const article = await res.json();
      router.push(`/dashboard/articles/${article.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="border-2 border-destructive bg-destructive/5 p-4">
          <p className="text-sm text-destructive font-body">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Article Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyId">Company</Label>
            <Select
              value={companyId}
              onValueChange={(v) => setCompanyId(v ?? "")}
              required
            >
              <SelectTrigger className="w-full" id="companyId">
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.ticker && ` (${c.ticker})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customHeadline">Custom Headline (optional)</Label>
            <Input
              id="customHeadline"
              placeholder="Leave empty for AI-generated headline"
              value={customHeadline}
              onChange={(e) => setCustomHeadline(e.target.value)}
            />
            <p className="text-xs text-muted-foreground font-body">
              If provided, this will be used as the article title. Otherwise, the AI will generate one.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Analyses</CardTitle>
        </CardHeader>
        <CardContent>
          {analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground font-body">
              No analyses available. Please analyze some signals first.
            </p>
          ) : (
            <div className="space-y-3">
              {analyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="flex items-start space-x-3 border border-border p-3 rounded-md"
                >
                  <Checkbox
                    id={analysis.id}
                    checked={selectedAnalysisIds.includes(analysis.id)}
                    onCheckedChange={() => toggleAnalysis(analysis.id)}
                  />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={analysis.id} className="text-sm font-medium cursor-pointer">
                      Analysis for Signal {analysis.signalId.slice(0, 8)}...
                    </Label>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {analysis.summary}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Confidence: {Math.round(analysis.confidence * 100)}%
                      </span>
                      <span className="text-muted-foreground">
                        Sentiment: {analysis.sentiment}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || selectedAnalysisIds.length === 0}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Generate Article
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>

      {submitting && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm font-body font-medium">
                  Generating article with AI...
                </p>
                <p className="text-xs text-muted-foreground font-body mt-1">
                  This may take 10-30 seconds. The LLM is synthesizing insights from the selected analyses.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </form>
  );
}
