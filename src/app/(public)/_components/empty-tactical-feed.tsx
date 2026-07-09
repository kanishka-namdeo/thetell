import { Headline, Body, Metadata, Button } from "@/components";
import { Target, SearchX } from "lucide-react";
import Link from "next/link";

interface EmptyTacticalFeedProps {
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
}

export function EmptyTacticalFeed({ hasActiveFilters, onClearFilters }: EmptyTacticalFeedProps) {
  if (hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
        <Headline level={2} size="card" className="mb-3">
          No Matching Inferences
        </Headline>
        <Body className="text-muted-foreground max-w-md mb-6">
          No strategic inferences match your current filters. Try adjusting your criteria or clear all filters to see all available intelligence.
        </Body>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        )}
        <Metadata className="mt-4">
          Inferences are generated from cross-signal analysis
        </Metadata>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Target className="h-12 w-12 text-muted-foreground mb-4" />
      <Headline level={2} size="card" className="mb-3">
        No Intelligence Briefings Yet
      </Headline>
      <Body className="text-muted-foreground max-w-md mb-6">
        Strategic inferences are generated after the AI cross-references multiple signals to detect patterns and predict corporate intent. The analysts are still connecting the dots.
      </Body>
      <Link href="/">
        <Button variant="outline">
          View Raw Signals
        </Button>
      </Link>
      <Metadata className="mt-4">
        Inferences appear here once cross-signal analysis is complete
      </Metadata>
    </div>
  );
}
