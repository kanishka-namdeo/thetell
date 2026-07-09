"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, Check, ChevronRight, FileJson } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { DeepAgentStructuredResponse } from "@/lib/deepagent/types";

interface DeepAgentStructuredOutputProps {
  response: DeepAgentStructuredResponse;
  className?: string;
}

export function DeepAgentStructuredOutput({
  response,
  className,
}: DeepAgentStructuredOutputProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error("deepagent.structured_output_copy_failed", { error: String(error) });
    }
  };

  const renderValue = (value: unknown, depth = 0): React.ReactNode => {
    if (value === null) {
      return <span className="text-muted-foreground">null</span>;
    }

    if (typeof value === "string") {
      return <span className="text-green-700 dark:text-green-400">&ldquo;{value}&rdquo;</span>;
    }

    if (typeof value === "number") {
      return <span className="text-blue-700 dark:text-blue-400">{value}</span>;
    }

    if (typeof value === "boolean") {
      return <span className="text-purple-700 dark:text-purple-400">{value.toString()}</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-muted-foreground">[]</span>;
      }

      return (
        <div className="ml-4 border-l border-border pl-2">
          {value.map((item, idx) => (
            <div key={idx} className="my-1">
              <span className="text-muted-foreground">[{idx}]: </span>
              {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      );
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        return <span className="text-muted-foreground">{"{}"}</span>;
      }

      return (
        <div className="ml-4 border-l border-border pl-2">
          {entries.map(([key, val]) => (
            <div key={key} className="my-1">
              <span className="text-orange-700 dark:text-orange-400 font-mono">{key}</span>
              <span className="text-muted-foreground">: </span>
              {renderValue(val, depth + 1)}
            </div>
          ))}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  return (
    <Card className={cn("bg-muted/30", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Structured Output</CardTitle>
            <Badge variant="outline" className="text-xs">
              {response.schemaName}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1 text-green-600" />
                  <span className="text-xs">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  <span className="text-xs">Copy</span>
                </>
              )}
            </Button>
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger
                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform",
                    isExpanded && "rotate-90"
                  )}
                />
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>
      </CardHeader>
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="rounded-md bg-background border border-border p-3 font-mono text-xs overflow-x-auto">
              <div className="text-muted-foreground mb-2">
                Schema: {response.schemaId}
              </div>
              {renderValue(response.data)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Generated at {new Date(response.timestamp).toLocaleString()}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
