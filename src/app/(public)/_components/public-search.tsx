"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, FileText, Building2, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchResult {
  signals: Array<{ id: string; title: string; company: { id: string; name: string } }>;
  companies: Array<{ id: string; name: string; ticker: string | null }>;
  articles: Array<{ id: string; title: string; company: { id: string; name: string } }>;
}

export function PublicSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/public/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setOpen(true);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, doSearch]);

  const navigateTo = (href: string) => {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(href);
  };

  const totalResults = results
    ? results.signals.length + results.companies.length + results.articles.length
    : 0;

  return (
    <div ref={containerRef} className="relative w-48 lg:w-64">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results && totalResults > 0) setOpen(true);
          }}
          className="pl-8 pr-8 h-8 text-xs font-sans"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults(null);
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results && (
        <div className="absolute top-full left-0 right-0 mt-1 border-2 border-foreground bg-background shadow-md z-50 max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs font-mono text-muted-foreground">Searching…</div>
          )}

          {!loading && totalResults === 0 && (
            <div className="px-3 py-2 text-xs font-mono text-muted-foreground">No results found</div>
          )}

          {!loading && results.signals.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-sans text-muted-foreground flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" /> Signals
              </div>
              {results.signals.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigateTo(`/signals/${s.id}`)}
                  className="w-full text-left px-3 py-2 text-xs font-body hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{s.title}</span>
                  <span className="text-muted-foreground ml-2">· {s.company.name}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && results.companies.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-sans text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Companies
              </div>
              {results.companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigateTo(`/companies/${c.id}`)}
                  className="w-full text-left px-3 py-2 text-xs font-body hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.ticker && (
                    <span className="text-muted-foreground ml-2 font-mono">({c.ticker})</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!loading && results.articles.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-sans text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Articles
              </div>
              {results.articles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigateTo(`/articles/${a.id}`)}
                  className="w-full text-left px-3 py-2 text-xs font-body hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground ml-2">· {a.company.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
