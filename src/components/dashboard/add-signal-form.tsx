"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyWithCounts } from "@/lib/api/schemas";
import { Loader2, Plus } from "lucide-react";

const SOURCE_TYPES = [
  { value: "NEWS", label: "News" },
  { value: "FILING", label: "Filing" },
  { value: "TRANSCRIPT", label: "Transcript" },
  { value: "SOCIAL", label: "Social" },
  { value: "BLOG", label: "Blog" },
  { value: "JOB_POSTING", label: "Job Posting" },
] as const;

interface AddSignalFormProps {
  companies: CompanyWithCounts[];
}

export function AddSignalForm({ companies }: AddSignalFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceUrl || !sourceType || !title || !rawContent || !companyId) {
      setError("All fields are required.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl,
          sourceType,
          title,
          rawContent,
          companyId,
          publishedAt: publishedAt || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to create signal" }));
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      const signal = await res.json();
      router.push(`/dashboard/signals/${signal.id}`);
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
          <CardTitle className="text-lg">Signal Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sourceUrl">Source URL</Label>
            <Input
              id="sourceUrl"
              type="url"
              placeholder="https://example.com/article"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sourceType">Source Type</Label>
            <Select
              value={sourceType}
              onValueChange={(v) => setSourceType(v ?? "")}
              required
            >
              <SelectTrigger className="w-full" id="sourceType">
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label htmlFor="publishedAt">Published Date (optional)</Label>
            <Input
              id="publishedAt"
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Signal title or headline"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rawContent">Content</Label>
            <Textarea
              id="rawContent"
              placeholder="Paste the signal content here..."
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              rows={10}
              required
            />
            <p className="text-xs text-muted-foreground font-body">
              The full text content will be analyzed by the AI pipeline.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add Signal
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
    </form>
  );
}
