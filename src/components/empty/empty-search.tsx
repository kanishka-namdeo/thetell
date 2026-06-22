import { Headline, Body, Metadata } from "@/components";
import { Search } from "lucide-react";

interface EmptySearchProps {
  query?: string;
}

export function EmptySearch({ query }: EmptySearchProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-12 w-12 text-muted-foreground mb-4" />
      <Headline level={2} size="card" className="mb-3">
        No Results
      </Headline>
      <Body className="text-muted-foreground max-w-md mb-4">
        {query ? (
          <>
            No signals found for &quot;<span className="font-semibold text-foreground">{query}</span>&quot;.
            Try different keywords or broader search terms.
          </>
        ) : (
          "Your search returned no matches. Try adjusting your query or explore the full feed."
        )}
      </Body>
      <Metadata>
        Search across signal titles, companies, and content
      </Metadata>
    </div>
  );
}
