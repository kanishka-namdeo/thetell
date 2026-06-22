"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  WifiOff,
  Server,
  Radio,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BackendStatus = "connected" | "disconnected" | "checking";

interface DebugEvent {
  type: string;
  content?: string;
  tool?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_input?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_output?: any;
  timestamp: string;
}

export default function DebugAgentPage() {
  const [problem, setProblem] = useState("");
  const [context, setContext] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [activeSessions, setActiveSessions] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check backend connectivity
  const checkBackendStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/debug/status");
      if (!res.ok) throw new Error("Status check failed");
      
      const data = await res.json();
      setBackendStatus(data.backend as BackendStatus);
      setActiveSessions(data.activeSessions || 0);
    } catch {
      setBackendStatus("disconnected");
    }
  }, []);

  // Check backend status on mount and periodically
  useEffect(() => {
    let mounted = true;
    
    const check = async () => {
      try {
        const res = await fetch("/api/v1/admin/debug/status");
        if (!res.ok) throw new Error("Status check failed");
        
        const data = await res.json();
        if (mounted) {
          setBackendStatus(data.backend as BackendStatus);
          setActiveSessions(data.activeSessions || 0);
        }
      } catch {
        if (mounted) {
          setBackendStatus("disconnected");
        }
      }
    };
    
    check();
    const interval = setInterval(check, 10000); // Check every 10s
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const startDebug = async () => {
    if (!problem.trim()) {
      setError("Please describe the problem");
      return;
    }

    setError(null);
    setEvents([]);
    setIsRunning(true);

    try {
      const res = await fetch("/api/v1/admin/debug/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, context }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to start debug session");
      }

      const data = await res.json();
      setSessionId(data.sessionId);

      // Connect to event stream
      const eventSource = new EventSource(
        `/api/v1/admin/debug/stream?sessionId=${data.sessionId}`
      );
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setEvents((prev) => [...prev, data]);
        } catch (err) {
          console.error("Failed to parse event:", err);
        }
      };

      eventSource.onerror = () => {
        console.error("EventSource error");
        eventSource.close();
        setIsRunning(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsRunning(false);
    }
  };

  const stopDebug = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
    // Refresh backend status after stopping
    checkBackendStatus();
  };

  const reset = () => {
    stopDebug();
    setSessionId(null);
    setEvents([]);
    setProblem("");
    setContext("");
    setError(null);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Debug Agent</h1>
        <p className="text-muted-foreground mt-2">
          AI-powered debugging assistant with access to your codebase, database, and MCP tools
        </p>
      </div>

      {/* Status Banner */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Backend Status */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  backendStatus === "connected" && "bg-success/10",
                  backendStatus === "disconnected" && "bg-destructive/10",
                  backendStatus === "checking" && "bg-muted"
                )}
              >
                {backendStatus === "connected" && (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                {backendStatus === "disconnected" && (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                {backendStatus === "checking" && (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Backend Status</div>
                <div className="text-xs text-muted-foreground">
                  {backendStatus === "connected" && "OpenCode connected"}
                  {backendStatus === "disconnected" && "Backend unavailable"}
                  {backendStatus === "checking" && "Checking..."}
                </div>
              </div>
            </div>

            {/* Agent Status */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  isRunning && "bg-primary/10",
                  !isRunning && sessionId && "bg-success/10",
                  !isRunning && !sessionId && "bg-muted"
                )}
              >
                {isRunning && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                {!isRunning && sessionId && (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                {!isRunning && !sessionId && <Server className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Agent Status</div>
                <div className="text-xs text-muted-foreground">
                  {isRunning && "Running"}
                  {!isRunning && sessionId && "Completed"}
                  {!isRunning && !sessionId && "Idle"}
                </div>
              </div>
            </div>

            {/* Event Stream */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  isRunning && "bg-success/10",
                  !isRunning && sessionId && "bg-muted",
                  !isRunning && !sessionId && "bg-muted"
                )}
              >
                {isRunning && <Radio className="h-5 w-5 text-success animate-pulse" />}
                {!isRunning && sessionId && <Radio className="h-5 w-5 text-muted-foreground" />}
                {!isRunning && !sessionId && (
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Event Stream</div>
                <div className="text-xs text-muted-foreground">
                  {isRunning && "Connected"}
                  {!isRunning && sessionId && "Closed"}
                  {!isRunning && !sessionId && "Not started"}
                </div>
              </div>
            </div>
          </div>

          {backendStatus === "connected" && activeSessions > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                <span>
                  {activeSessions} active session{activeSessions !== 1 ? "s" : ""} on backend
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Describe the Problem</CardTitle>
            <CardDescription>
              Tell the debug agent what&apos;s wrong. Be specific about symptoms and expected behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Problem Description *</label>
              <Textarea
                placeholder="e.g., Company &apos;AMD&apos; has zero signals fetched, but it should have signals from RSS feeds and news scrapers..."
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                rows={4}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Context (Optional)</label>
              <Textarea
                placeholder="e.g., The company was added yesterday, I've checked the database and CompanyDataSource records exist..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
                disabled={isRunning}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              {!isRunning ? (
                <Button onClick={startDebug} disabled={!problem.trim()}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Debug Session
                </Button>
              ) : (
                <Button onClick={stopDebug} variant="destructive">
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              )}
              {sessionId && (
                <Button onClick={reset} variant="outline">
                  Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Session Info</CardTitle>
            <CardDescription>Current debug session status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge
                  variant={isRunning ? "default" : "secondary"}
                  className={cn(
                    "gap-1.5",
                    isRunning && "bg-primary",
                    !isRunning && sessionId && "bg-success text-success-foreground",
                    !isRunning && !sessionId && "bg-muted text-muted-foreground"
                  )}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running
                    </>
                  ) : sessionId ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </>
                  ) : (
                    <>
                      <Server className="h-3 w-3" />
                      Idle
                    </>
                  )}
                </Badge>
              </div>
              {sessionId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Session ID</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {sessionId.slice(0, 8)}...
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Events</span>
                <span className="text-sm">{events.length}</span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Available Tools</h4>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  Prisma
                </Badge>
                <Badge variant="outline" className="text-xs">
                  GitHub
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Chrome DevTools
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Context7
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Sequential Thinking
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Output Panel */}
      {events.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Debug Output</CardTitle>
            <CardDescription>Real-time output from the debug agent</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4" ref={scrollRef}>
              <div className="space-y-3">
                {events.map((event, idx) => (
                  <div key={idx} className="border-l-2 border-primary/20 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {event.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {event.content && (
                      <div className="text-sm whitespace-pre-wrap">{event.content}</div>
                    )}
                    {event.tool && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Tool: {event.tool}
                        </div>
                        {event.tool_input && (
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(event.tool_input, null, 2)}
                          </pre>
                        )}
                        {event.tool_output && (
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(event.tool_output, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
