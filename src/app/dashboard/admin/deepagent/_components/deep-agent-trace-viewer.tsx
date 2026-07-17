"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  Filter,
  Download,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { logger } from "@/lib/logger";

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: string;
  duration?: number;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface TraceEntry {
  messageId: string;
  timestamp: string;
  role: string;
  content: string;
  toolCalls: ToolCall[];
  tokenUsage?: TokenUsage;
}

interface TraceSummary {
  totalMessages: number;
  totalToolCalls: number;
  totalTokens: number;
  totalDuration: number;
  toolCallSuccessRate: number;
}

interface TraceData {
  trace: TraceEntry[];
  summary: TraceSummary;
}

interface DeepAgentTraceViewerProps {
  sessionId: string | null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function truncateContent(content: string, maxLength: number = 150): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + "...";
}

function JsonViewer({ data, title }: { data: unknown; title: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 rounded-md bg-muted p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
          <code>{jsonString}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const isSuccess =
    toolCall.status === "success" || toolCall.status === "completed";

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isSuccess ? "default" : "destructive"} className="gap-1">
            {isSuccess ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {toolCall.status}
          </Badge>
          <span className="font-mono text-sm font-medium">{toolCall.name}</span>
        </div>
        {toolCall.duration !== undefined && (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(toolCall.duration)}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <JsonViewer data={toolCall.input} title="Input" />
        {toolCall.output !== undefined && (
          <JsonViewer data={toolCall.output} title="Output" />
        )}
      </div>
    </div>
  );
}

function MessageCard({ entry }: { entry: TraceEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasToolCalls = entry.toolCalls.length > 0;

  const roleBadgeVariant =
    entry.role === "user"
      ? "default"
      : entry.role === "assistant"
      ? "secondary"
      : "outline";

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="relative">
        <CollapsibleTrigger
          className="w-full cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge variant={roleBadgeVariant} className="capitalize">
                  {entry.role}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTimestamp(entry.timestamp)}
                </span>
                {hasToolCalls && (
                  <Badge variant="outline" className="gap-1">
                    <Zap className="h-3 w-3" />
                    {entry.toolCalls.length} tool{entry.toolCalls.length !== 1 ? "s" : ""}
                  </Badge>
                )}
                {entry.tokenUsage && (
                  <Badge variant="outline" className="gap-1">
                    {entry.tokenUsage.totalTokens.toLocaleString()} tokens
                  </Badge>
                )}
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            {!isExpanded && entry.content && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {truncateContent(entry.content)}
              </p>
            )}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {entry.content && (
              <>
                <Separator />
                <div className="text-sm whitespace-pre-wrap">{entry.content}</div>
              </>
            )}
            {hasToolCalls && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Tool Calls</h4>
                  {entry.toolCalls.map((toolCall) => (
                    <ToolCallCard key={toolCall.id} toolCall={toolCall} />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function DeepAgentTraceViewer({ sessionId }: DeepAgentTraceViewerProps) {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toolNameSearch, setToolNameSearch] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchTraceAsync = async () => {
      if (!sessionId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/v1/admin/deepagent/trace?sessionId=${encodeURIComponent(sessionId)}`,
          {
credentials: "include", signal: controller.signal }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.message || "Failed to fetch trace");
        }

        const result: TraceData = await response.json();
        setData(result);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        logger.error("deepagent.trace.fetch_error", { error: String(err) });
        setError(err instanceof Error ? err.message : "Failed to load trace");
      } finally {
        setLoading(false);
      }
    };

    fetchTraceAsync();

    return () => controller.abort();
  }, [sessionId, retryKey]);

  const filteredTrace = useMemo(() => {
    if (!data) return [];

    return data.trace.filter((entry) => {
      if (roleFilter !== "all" && entry.role !== roleFilter) return false;

      if (statusFilter !== "all" && entry.toolCalls.length > 0) {
        const hasMatchingStatus = entry.toolCalls.some((tc) => {
          if (statusFilter === "success") {
            return tc.status === "success" || tc.status === "completed";
          }
          if (statusFilter === "error") {
            return tc.status === "error" || tc.status === "failed";
          }
          return true;
        });
        if (!hasMatchingStatus) return false;
      }

      if (toolNameSearch && entry.toolCalls.length > 0) {
        const searchLower = toolNameSearch.toLowerCase();
        const hasMatchingTool = entry.toolCalls.some((tc) =>
          tc.name.toLowerCase().includes(searchLower)
        );
        if (!hasMatchingTool) return false;
      }

      return true;
    });
  }, [data, roleFilter, statusFilter, toolNameSearch]);

  const handleExport = useCallback(() => {
    if (!data) return;

    const exportData = {
      sessionId,
      exportedAt: new Date().toISOString(),
      ...data,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-${sessionId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, sessionId]);

  if (!sessionId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Select a session to view execution trace
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <p className="font-medium">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{summary.totalMessages}</div>
              <div className="text-xs text-muted-foreground">Messages</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{summary.totalToolCalls}</div>
              <div className="text-xs text-muted-foreground">Tool Calls</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {summary.totalTokens.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Tokens</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {formatDuration(summary.totalDuration)}
              </div>
              <div className="text-xs text-muted-foreground">Duration</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {(summary.toolCallSuccessRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "all")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="assistant">Assistant</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Search tool name..."
              value={toolNameSearch}
              onChange={(e) => setToolNameSearch(e.target.value)}
              className="w-[200px]"
            />
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExport}
            >
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-3 pr-3">
          {filteredTrace.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  No messages match the current filters
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredTrace.map((entry) => (
              <MessageCard key={entry.messageId} entry={entry} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
