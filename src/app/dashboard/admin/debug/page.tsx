"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  BackendStatus,
  DebugEvent,
  StreamStatus,
} from "@/lib/debug/event-types";
import { DebugStatusBanner } from "./_components/debug-status-banner";
import { DebugInputPanel } from "./_components/debug-input-panel";
import { DebugSessionInfo } from "./_components/debug-session-info";
import { DebugEventStream } from "./_components/debug-event-stream";
import { DebugToolbar } from "./_components/debug-toolbar";
import { DebugSessionHistory } from "./_components/debug-session-history";
import { DebugLiveMetrics } from "./_components/debug-live-metrics";
import { DebugProgressIndicator } from "./_components/debug-progress-indicator";
import { DebugToolTimeline } from "./_components/debug-tool-timeline";
import { DebugTemplates } from "./_components/debug-templates";
import { DebugRelatedSignals } from "./_components/debug-related-signals";

const MAX_RECONNECT_DELAY = 30000;

export default function DebugAgentPage() {
  const [problem, setProblem] = useState("");
  const [context, setContext] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [activeSessions, setActiveSessions] = useState(0);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("disconnected");
  const [showHistory, setShowHistory] = useState(true);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isRunningRef = useRef(false);
  const connectToStreamRef = useRef<(sid: string) => void>(() => {});

  // Keep refs in sync with state for use in callbacks
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

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

  const connectToStream = useCallback((sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/v1/admin/debug/stream?sessionId=${sid}`
    );
    eventSourceRef.current = eventSource;
    setStreamStatus("connected");
    reconnectAttemptsRef.current = 0;

    eventSource.onopen = () => {
      setStreamStatus("connected");
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DebugEvent;
        setEvents((prev) => [...prev, data]);
      } catch (err) {
        console.error("Failed to parse event:", err);
      }
    };

    eventSource.onerror = () => {
      console.error("EventSource error");
      eventSource.close();
      eventSourceRef.current = null;

      if (isRunningRef.current) {
        // Exponential backoff reconnection
        const attempt = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
        reconnectAttemptsRef.current++;
        setStreamStatus("reconnecting");

        reconnectTimeoutRef.current = setTimeout(() => {
          connectToStreamRef.current(sid);
        }, delay);
      } else {
        setStreamStatus("disconnected");
      }
    };
  }, []);

  // Keep ref in sync with the callback
  useEffect(() => {
    connectToStreamRef.current = connectToStream;
  }, [connectToStream]);

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
    const interval = setInterval(check, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const startDebug = async () => {
    if (!problem.trim()) {
      setError("Please describe the problem");
      return;
    }

    setError(null);
    setEvents([]);
    setIsRunning(true);
    setStreamStatus("disconnected");
    setShowHistory(false);

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
      connectToStream(data.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsRunning(false);
      setStreamStatus("disconnected");
    }
  };

  const stopDebug = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Cancel backend session properly
    if (sessionId) {
      try {
        await fetch(`/api/v1/admin/debug/session/${sessionId}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Failed to cancel session:", err);
      }
    }

    setIsRunning(false);
    setStreamStatus("disconnected");
    checkBackendStatus();
  };

  const reset = () => {
    stopDebug();
    setSessionId(null);
    setEvents([]);
    setProblem("");
    setContext("");
    setError(null);
    setShowHistory(true);
  };

  const handleSelectSession = (sid: string, savedProblem: string) => {
    setSessionId(sid);
    setProblem(savedProblem);
    setEvents([]);
    setShowHistory(false);
    // Note: We can't reconnect to old sessions, just show the history
  };

  const handleResumeSession = (sid: string, savedProblem: string) => {
    setSessionId(sid);
    setProblem(savedProblem);
    setEvents([]);
    setShowHistory(false);
    connectToStream(sid);
    setIsRunning(true);
  };

  const handleTemplateSelect = (templateProblem: string, templateContext: string) => {
    setProblem(templateProblem);
    setContext(templateContext);
    setShowHistory(false);
  };

  const handleFollowUp = async () => {
    if (!followUpMessage.trim() || !sessionId) return;

    setError(null);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/v1/admin/debug/session/${sessionId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: followUpMessage }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send follow-up");
      }

      setFollowUpMessage("");
      connectToStream(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Debug Agent</h1>
        <p className="text-muted-foreground mt-2">
          AI-powered debugging assistant with access to your codebase, database, and MCP tools
        </p>
      </div>

      <DebugStatusBanner
        backendStatus={backendStatus}
        isRunning={isRunning}
        sessionId={sessionId}
        streamStatus={streamStatus}
        activeSessions={activeSessions}
      />

      {isRunning && (
        <div className="mb-6">
          <DebugProgressIndicator events={events} isRunning={isRunning} />
        </div>
      )}

      {showHistory ? (
        <div className="space-y-6">
          <DebugTemplates onSelectTemplate={handleTemplateSelect} />
          <DebugSessionHistory
            onSelectSession={handleSelectSession}
            onResumeSession={handleResumeSession}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 mb-6">
            <DebugInputPanel
              problem={problem}
              context={context}
              isRunning={isRunning}
              error={error}
              onProblemChange={setProblem}
              onContextChange={setContext}
              onStart={startDebug}
              onStop={stopDebug}
              onReset={reset}
            />
            <DebugSessionInfo
              sessionId={sessionId}
              isRunning={isRunning}
              eventCount={events.length}
              onReset={reset}
            />
          </div>

          <DebugToolbar
            events={events}
            sessionId={sessionId}
            problem={problem}
            context={context}
            status={isRunning ? "running" : "completed"}
            startedAt={new Date().toISOString()}
          />

          {isRunning && (
            <div className="mb-6">
              <DebugLiveMetrics events={events} isRunning={isRunning} />
            </div>
          )}

          <DebugEventStream events={events} streamStatus={streamStatus} />

          <DebugToolTimeline events={events} />

          {events.length > 0 && <DebugRelatedSignals events={events} />}

          {!isRunning && sessionId && (
            <div className="mt-6 rounded-lg border border-border bg-card p-4">
              <label className="mb-2 block text-sm font-medium">
                Ask a follow-up question
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleFollowUp();
                    }
                  }}
                  placeholder="Continue the conversation..."
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!followUpMessage.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
