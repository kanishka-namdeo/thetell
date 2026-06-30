"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ArrowRight, Newspaper, Brain, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visual data flow diagram showing the pipeline:
 * Signals → Single-Signal Analysis → Articles
 * Signals → Cross-Signal Correlation → Strategic Insights
 *
 * Collapsible by default. Uses design tokens from globals.css.
 */
export function DataFlowDiagram() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="gap-2 text-xs font-mono uppercase tracking-wider w-full justify-between"
      >
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand" />
          How it works
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      {isExpanded && (
        <div className="pt-3 space-y-4 animate-in fade-in-0 slide-in-from-top-2">
          {/* Main Flow Row */}
          <div className="flex items-start gap-2 overflow-x-auto">
            {/* Signals Node */}
            <div className="flex flex-col items-center min-w-[120px]">
              <Badge variant="muted" className="text-[10px] mb-1">
                Raw Data
              </Badge>
              <div className="border-2 border-foreground bg-background p-3 flex flex-col items-center gap-1">
                <Layers className="h-5 w-5 text-primary" />
                <span className="text-xs font-sans font-medium text-foreground">
                  Signals
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 text-center">
                News, filings, social
              </span>
            </div>

            {/* Arrow 1 */}
            <div className="flex items-center pt-6">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Single-Signal Analysis Node */}
            <div className="flex flex-col items-center min-w-[120px]">
              <Badge variant="outline" className="text-[10px] mb-1">
                AI Processing
              </Badge>
              <div className="border border-border bg-ai-surface p-3 flex flex-col items-center gap-1">
                <Brain className="h-5 w-5 text-brand" />
                <span className="text-xs font-sans font-medium text-foreground">
                  Analysis
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 text-center">
                Per-signal extraction
              </span>
            </div>

            {/* Arrow 2 */}
            <div className="flex items-center pt-6">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Articles Node */}
            <div className="flex flex-col items-center min-w-[120px]">
              <Badge variant="tell" className="text-[10px] mb-1">
                Output
              </Badge>
              <div className="border border-border bg-background p-3 flex flex-col items-center gap-1">
                <Newspaper className="h-5 w-5 text-primary" />
                <span className="text-xs font-sans font-medium text-foreground">
                  Articles
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 text-center">
                AI-generated reports
              </span>
            </div>
          </div>

          {/* Alternative Flow: Cross-Signal Correlation */}
          <div className="flex items-start gap-2 overflow-x-auto pt-2">
            {/* Signals (shared start point indicator) */}
            <div className="flex flex-col items-center min-w-[120px] opacity-50">
              <div className="border-2 border-foreground bg-background p-3 flex flex-col items-center gap-1">
                <Layers className="h-5 w-5 text-primary" />
                <span className="text-xs font-sans font-medium text-foreground">
                  Signals
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center pt-6">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Cross-Signal Correlation Node */}
            <div className="flex flex-col items-center min-w-[140px]">
              <Badge variant="outline" className="text-[10px] mb-1">
                AI Processing
              </Badge>
              <div className="border border-border bg-ai-surface p-3 flex flex-col items-center gap-1">
                <Brain className="h-5 w-5 text-brand" />
                <span className="text-xs font-sans font-medium text-foreground text-center">
                  Cross-Signal
                </span>
                <span className="text-xs font-sans font-medium text-foreground text-center">
                  Correlation
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 text-center">
                Pattern detection
              </span>
            </div>

            {/* Arrow */}
            <div className="flex items-center pt-6">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Strategic Insights Node */}
            <div className="flex flex-col items-center min-w-[120px]">
              <Badge variant="theme" className="text-[10px] mb-1">
                Output
              </Badge>
              <div className="border-2 border-brand bg-background p-3 flex flex-col items-center gap-1">
                <Brain className="h-5 w-5 text-brand" />
                <span className="text-xs font-sans font-medium text-foreground">
                  Insights
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 text-center">
                Strategic predictions
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="muted" className="text-[10px]">Raw Data</Badge>
              <span>Public information collected</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">AI Processing</Badge>
              <span>LLM analysis & inference</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="tell" className="text-[10px]">Output</Badge>
              <span>User-facing content</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}