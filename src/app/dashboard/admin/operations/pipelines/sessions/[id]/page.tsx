"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
  CircleDot,
  ExternalLink,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage, type AgentEvent } from "@/components/admin/chat-message";
import { SourceBadge } from "@/components/admin/source-badge";

type SessionStatus = "running" | "completed" | "failed" | "cancelled";

interface SessionUser {
  name: string | null;
  email: string | null;
}

interface DiscoveredSource {
  id: string;
  url: string;
  sourceType: string;
  label: string | null;
  priority: number;
  verified: boolean;
  verificationDetails: string | null;
}

interface SessionDetail {
  id: string;
  sessionId: string;
  companyName: string;
  companyId: string | null;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  user: SessionUser;
}

interface SessionResponse {
  session: SessionDetail;
  events: AgentEvent[];
  discoveredSources: DiscoveredSource[];
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const config = {
    running: { icon: Loader2, className: "bg-info/10 text-info border-info", label: "Running" },
    completed: { icon: CheckCircle2, className: "bg-success/10 text-success border-success", label: "Completed" },
    failed: { icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive", label: "Failed" },
    cancelled: { icon: CircleDot, className: "bg-muted text-muted-foreground border-muted", label: "Cancelled" },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("flex items-center gap-1.5", config.className)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {config.label}
    </Badge>
  );
}

export default function PipelineSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>("");
  const [data, setData] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; applied: number; errors: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    params.then((p) => setSessionId(p.id));
  }, [params]);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/v1/admin/pipelines/sessions/${sessionId}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SessionResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSession();
    return () => abortRef.current?.abort();
  }, [fetchSession]);

  const handleApply = async () => {
    if (!data?.session) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await fetch("/api/v1/admin/pipelines/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: data.session.sessionId,
          companyId: data.session.companyId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setApplyResult(result);
    } catch (err) {
      setApplyResult({
        success: false,
        applied: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRerun = () => {
    if (!data?.session) return;
    router.push(
      `/dashboard/admin/operations/pipelines?rerun=${encodeURIComponent(data.session.companyName)}`
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin/operations/pipelines/sessions")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Button>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">
                Failed to load session: {error || "Not found"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { session, events, discoveredSources } = data;
  const gapEvents = events.filter((e) => e.type === "agent.decision");
  const verifiedCount = discoveredSources.filter((s) => s.verified).length;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/admin/operations/pipelines/sessions")}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Sessions
      </Button>

      {/* Session Metadata */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl">{session.companyName}</CardTitle>
                <StatusBadge status={session.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                Session: {session.sessionId}
              </p>
              {session.user && (
                <p className="text-sm text-muted-foreground">
                  Run by: {session.user.name || session.user.email || "Unknown"}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSession}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
              {session.status === "completed" && discoveredSources.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Re-apply Sources
                    </>
                  )}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleRerun}>
                <Play className="h-4 w-4 mr-2" />
                Re-run
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Started</p>
              <p className="font-mono flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3 w-3" />
                {formatDateTime(session.startedAt)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Completed</p>
              <p className="font-mono flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3 w-3" />
                {formatDateTime(session.completedAt)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Duration</p>
              <p className="font-mono mt-0.5">
                {formatDuration(session.startedAt, session.completedAt)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Sources Found</p>
              <p className="font-mono mt-0.5">
                {discoveredSources.length} ({verifiedCount} verified)
              </p>
            </div>
          </div>
          {session.error && (
            <div className="mt-4 flex items-center gap-2 text-destructive p-3 bg-destructive/10 rounded-md">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-sm">{session.error}</p>
            </div>
          )}
          {applyResult && (
            <div className={cn(
              "mt-4 p-3 rounded-md flex items-start gap-2",
              applyResult.success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              {applyResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                {applyResult.success ? (
                  <p>Successfully applied {applyResult.applied} sources.</p>
                ) : (
                  <p>Failed to apply sources.</p>
                )}
                {applyResult.errors.length > 0 && (
                  <ul className="mt-1 text-xs space-y-0.5">
                    {applyResult.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Log Replay */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-base">Event Log</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No events recorded</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {events.map((event, index) => (
                <ChatMessage key={index} event={event} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discovered Sources */}
      <Card className="border-2 border-foreground">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Discovered Sources ({discoveredSources.length})
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {verifiedCount} verified
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {discoveredSources.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sources discovered</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {discoveredSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-start gap-3 border rounded-md p-3 bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <SourceBadge
                        url={source.url}
                        sourceType={source.sourceType}
                        label={source.label || undefined}
                        verified={source.verified}
                        priority={source.priority}
                      />
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 truncate"
                    >
                      {source.url}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    {source.verificationDetails && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {source.verificationDetails}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gap Analysis */}
      {gapEvents.length > 0 && (
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-warning" />
              Gap Analysis & Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gapEvents.map((event, index) => {
                if (event.type !== "agent.decision") return null;
                return (
                  <div key={index} className="bg-muted p-3 rounded-md">
                    <p className="text-sm text-muted-foreground">{event.reasoning}</p>
                    <p className="text-sm mt-1">
                      <strong>Action:</strong> {event.action}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
