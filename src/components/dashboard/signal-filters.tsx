"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface SignalFiltersProps {
  sourceType: string | null;
  status: string | null;
  sentiment: string | null;
  companyId: string | null;
  companies?: { id: string; name: string }[];
  onSourceTypeChange: (value: string | null) => void;
  onStatusChange: (value: string | null) => void;
  onSentimentChange: (value: string | null) => void;
  onCompanyChange: (value: string | null) => void;
  onClearAll: () => void;
}

export function SignalFilters({
  sourceType,
  status,
  sentiment,
  companyId,
  companies = [],
  onSourceTypeChange,
  onStatusChange,
  onSentimentChange,
  onCompanyChange,
  onClearAll,
}: SignalFiltersProps) {
  const hasFilters = sourceType || status || sentiment || companyId;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={sourceType || ""}
        onValueChange={(v) => onSourceTypeChange(v || null)}
      >
        <SelectTrigger>Source Type</SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Types</SelectItem>
          <SelectItem value="NEWS">News</SelectItem>
          <SelectItem value="FILING">Filing</SelectItem>
          <SelectItem value="TRANSCRIPT">Transcript</SelectItem>
          <SelectItem value="SOCIAL">Social</SelectItem>
          <SelectItem value="BLOG">Blog</SelectItem>
          <SelectItem value="JOB_POSTING">Job Posting</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={status || ""}
        onValueChange={(v) => onStatusChange(v || null)}
      >
        <SelectTrigger>Status</SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Statuses</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="ANALYZING">Analyzing</SelectItem>
          <SelectItem value="ANALYZED">Analyzed</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={sentiment || ""}
        onValueChange={(v) => onSentimentChange(v || null)}
      >
        <SelectTrigger>Sentiment</SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Sentiments</SelectItem>
          <SelectItem value="POSITIVE">Positive</SelectItem>
          <SelectItem value="NEGATIVE">Negative</SelectItem>
          <SelectItem value="NEUTRAL">Neutral</SelectItem>
        </SelectContent>
      </Select>

      {companies.length > 0 && (
        <Select
          value={companyId || ""}
          onValueChange={(v) => onCompanyChange(v || null)}
        >
          <SelectTrigger>Company</SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
