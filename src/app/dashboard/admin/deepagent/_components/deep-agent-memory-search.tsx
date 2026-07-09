"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface MatchEntry {
  line: number;
  text: string;
  highlight: string;
}

interface SearchResult {
  fileName: string;
  content: string;
  matches: MatchEntry[];
  relevanceScore: number;
}

interface SearchResponse {
  results: SearchResult[];
  totalMatches: number;
  query: string;
}

interface DeepAgentMemorySearchProps {
  className?: string;
  onFileSelect?: (fileName: string) => void;
}

export function DeepAgentMemorySearch({
  className,
  onFileSelect,
}: DeepAgentMemorySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.trim().length < 2) {
        setResults(null);
        setTotalMatches(0);
        setError(null);
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/v1/admin/deepagent/memory/search?q=${encodeURIComponent(searchQuery)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`Search failed: ${res.status}`);
        }
        const data: SearchResponse = await res.json();
        setResults(data.results);
        setTotalMatches(data.totalMatches);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        logger.error("deepagent.memory.search.failed", { error: String(err) });
        setError("Search failed. Please try again.");
        setResults(null);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const handleClear = () => {
    setQuery("");
    setResults(null);
    setTotalMatches(0);
    setError(null);
  };

  const handleResultClick = (fileName: string) => {
    onFileSelect?.(fileName);
  };

  const highlightMatch = (text: string, highlight: string) => {
    if (!highlight) return text;
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-warning text-warning-foreground rounded-sm px-0.5">
          {text.slice(idx, idx + highlight.length)}
        </mark>
        {text.slice(idx + highlight.length)}
      </>
    );
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search memory files..."
          aria-label="Search memory files"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 pl-8 pr-8 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive py-2">{error}</div>
      )}

      {!isLoading && results !== null && results.length === 0 && !error && (
        <div className="text-xs text-muted-foreground text-center py-4">
          No results found for &quot;{query}&quot;
        </div>
      )}

      {!isLoading && results && results.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{totalMatches} match{totalMatches !== 1 ? "es" : ""} in {results.length} file{results.length !== 1 ? "s" : ""}</span>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-1.5">
              {results.map((result) => (
                <Card
                  key={result.fileName}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handleResultClick(result.fileName)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleResultClick(result.fileName);
                    }
                  }}
                >
                  <CardContent className="p-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono font-medium truncate flex-1">
                        {result.fileName}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {result.matches.length}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(result.relevanceScore * 100)}%
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {result.matches.slice(0, 3).map((match) => (
                        <div
                          key={match.line}
                          className="text-[11px] font-mono text-muted-foreground truncate"
                        >
                          <span className="text-muted-foreground/60 mr-1.5">
                            {match.line}:
                          </span>
                          {highlightMatch(match.text, match.highlight)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
