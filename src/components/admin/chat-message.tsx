"use client";

import { Bot, Loader2, CheckCircle, AlertTriangle, Plus, XCircle, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export type AgentEvent =
  | { type: "session.started"; sessionId: string; company: string }
  | { type: "agent.thinking"; message: string }
  | { type: "tool.call_start"; tool: string; args: Record<string, unknown> }
  | { type: "tool.call_end"; tool: string; result: unknown; duration: number }
  | { type: "tool.error"; tool: string; error: string }
  | {
      type: "source.discovered";
      source: { url: string; sourceType: string; label?: string; priority?: number };
    }
  | { type: "source.verified"; url: string; status: "valid" | "invalid"; details?: string }
  | { type: "progress.update"; stage: string; percent: number }
  | { type: "agent.decision"; reasoning: string; action: string }
  | {
      type: "session.completed";
      sources: { url: string; sourceType: string; label?: string; priority?: number }[];
      gaps: string[];
    }
  | { type: "session.error"; error: string; recoverable: boolean }
  | { type: "session.cancelled"; reason: string };

interface ChatMessageProps {
  event: AgentEvent;
}

export function ChatMessage({ event }: ChatMessageProps) {
  switch (event.type) {
    case "session.started":
      return (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Bot className="h-4 w-4" />
          <span>Starting pipeline discovery for &quot;{event.company}&quot;</span>
        </div>
      );

    case "agent.thinking":
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Bot className="h-4 w-4" />
          <span className="text-sm italic">{event.message}</span>
        </div>
      );

    case "tool.call_start":
      return (
        <div className="flex items-start gap-2 text-info">
          <Loader2 className="h-4 w-4 animate-spin mt-0.5" />
          <div className="flex-1">
            <span className="text-sm font-medium">Calling {event.tool}...</span>
            {Object.keys(event.args).length > 0 && (
              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                {JSON.stringify(event.args, null, 2)}
              </pre>
            )}
          </div>
        </div>
      );

    case "tool.call_end":
      return (
        <div className="flex items-center gap-2 text-success">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">
            {event.tool} completed in {event.duration}ms
          </span>
        </div>
      );

    case "tool.error":
      return (
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{event.tool} failed: {event.error}</span>
        </div>
      );

    case "source.discovered":
      return (
        <div className="flex items-start gap-2 border-l-2 border-success pl-3 py-1">
          <Plus className="h-4 w-4 text-success mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{event.source.label}</span>
              <Badge variant="outline" className="text-xs">
                {event.source.sourceType}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 break-all">
              {event.source.url}
            </p>
          </div>
        </div>
      );

    case "source.verified":
      return (
        <div className="flex items-center gap-2 pl-3 py-1">
          {event.status === "valid" ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="text-sm">
            Verified {event.url}: {event.status}
          </span>
          {event.details && (
            <span className="text-xs text-muted-foreground">({event.details})</span>
          )}
        </div>
      );

    case "progress.update":
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{event.stage}</span>
            <span>{event.percent}%</span>
          </div>
          <Progress value={event.percent} className="h-2" />
        </div>
      );

    case "agent.decision":
      return (
        <div className="bg-muted p-3">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium">Decision</span>
          </div>
          <p className="text-sm text-muted-foreground">{event.reasoning}</p>
          <p className="text-sm mt-1">
            <strong>Action:</strong> {event.action}
          </p>
        </div>
      );

    case "session.completed":
      return (
        <div className="flex items-center gap-2 text-success font-medium">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">
            Discovery complete! Found {event.sources.length} sources.
            {event.gaps.length > 0 && ` Missing ${event.gaps.length} source types.`}
          </span>
        </div>
      );

    case "session.error":
      return (
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">Session error: {event.error}</span>
        </div>
      );

    case "session.cancelled":
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Session cancelled: {event.reason}</span>
        </div>
      );

    default:
      return null;
  }
}
