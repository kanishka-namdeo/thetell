import { Container, Section, Headline, Body, Metadata, Button } from "@/components";
import { Newspaper } from "lucide-react";

interface EmptyFeedProps {
  onClearFilters?: () => void;
}

export function EmptyFeed({ onClearFilters }: EmptyFeedProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
      <Headline level={2} size="card" className="mb-3">
        No Signals Found
      </Headline>
      <Body className="text-muted-foreground max-w-md mb-6">
        The newsroom is quiet. No signals match your current filters.
        Try adjusting your search criteria or check back later for new intelligence.
      </Body>
      {onClearFilters && (
        <Button variant="outline" onClick={onClearFilters}>
          Clear Filters
        </Button>
      )}
      <Metadata className="mt-4">
        Signals are continuously monitored from public sources
      </Metadata>
    </div>
  );
}
