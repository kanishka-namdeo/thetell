"use client";

import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info } from "lucide-react";
import type { DebugEvent } from "@/lib/debug/event-types";
import { MarkdownContent } from "./markdown-content";
import { ToolCallCard } from "./tool-call-card";

interface DebugEventRendererProps {
  event: DebugEvent;
}

export function DebugEventRenderer({ event }: DebugEventRendererProps) {
  // Text events - render as markdown
  if (event.type === "text" && event.content) {
    return (
      <div className="border-l-2 border-primary/20 pl-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs">
            {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <MarkdownContent content={event.content} />
      </div>
    );
  }

  // Tool use events
  if (event.type === "tool_use" && event.tool) {
    return (
      <div className="border-l-2 border-muted-foreground/20 pl-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs">
            {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <ToolCallCard
          tool={event.tool}
          input={event.tool_input}
          duration={event.duration}
        />
      </div>
    );
  }

  // Tool result events
  if (event.type === "tool_result" && event.tool) {
    return (
      <div className="border-l-2 border-muted-foreground/20 pl-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs">
            {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <ToolCallCard
          tool={event.tool}
          output={event.tool_output}
          success={event.success}
          duration={event.duration}
          isResult
        />
      </div>
    );
  }

  // Error events
  if (event.type === "error" && event.content) {
    return (
      <div className="border-l-2 border-destructive/50 pl-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="text-sm text-destructive font-medium">
          {event.content}
        </div>
      </div>
    );
  }

  // System events
  if (event.type === "system" && event.content) {
    return (
      <div className="border-l-2 border-info/50 pl-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30">
            <Info className="h-3 w-3 mr-1" />
            {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {event.content}
        </div>
      </div>
    );
  }

  // Fallback for unknown or empty events
  return (
    <div className="border-l-2 border-border pl-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs">
          {event.type}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {event.content && (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
          {event.content}
        </div>
      )}
    </div>
  );
}
