"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentEvent } from "@/components/admin/chat-message";
import { logger } from "@/lib/logger";

export interface DiscoveredSource {
  url: string;
  sourceType: string;
  label?: string;
  priority?: number;
  verified?: boolean;
}

interface UsePipelineStreamOptions {
  companyName: string;
  companyId?: string;
  onSessionComplete?: (sources: DiscoveredSource[], gaps: string[]) => void;
  onSessionError?: (error: string) => void;
}

interface UsePipelineStreamResult {
  events: AgentEvent[];
  sources: DiscoveredSource[];
  gaps: string[];
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
  start: () => void;
  cancel: () => void;
  clear: () => void;
}

export function usePipelineStream(options: UsePipelineStreamOptions): UsePipelineStreamResult {
  const { companyName, companyId, onSessionComplete, onSessionError } = options;

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sources, setSources] = useState<DiscoveredSource[]>([]);
  const [gaps, setGaps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onSessionCompleteRef = useRef(onSessionComplete);
  const onSessionErrorRef = useRef(onSessionError);

  useEffect(() => { onSessionCompleteRef.current = onSessionComplete; }, [onSessionComplete]);
  useEffect(() => { onSessionErrorRef.current = onSessionError; }, [onSessionError]);

  const start = useCallback(() => {
    // Cancel any existing stream
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setEvents([]);
    setSources([]);
    setGaps([]);

    const fetchStream = async () => {
      try {
        const response = await fetch("/api/v1/admin/pipelines/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, companyId }),
          signal: controller.signal,
          credentials: "include",
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as AgentEvent;
                if (mountedRef.current) {
                  setEvents((prev) => [...prev, data]);
                }

                // Track discovered sources
                if (data.type === "source.discovered") {
                  if (mountedRef.current) {
                    setSources((prev) => [...prev, data.source]);
                  }
                }

                // Track completion
                if (data.type === "session.completed") {
                  if (mountedRef.current) {
                    setGaps(data.gaps);
                  }
                  onSessionCompleteRef.current?.(data.sources, data.gaps);
                }

                // Track errors
                if (data.type === "session.error") {
                  if (mountedRef.current) {
                    setError(data.error);
                  }
                  onSessionErrorRef.current?.(data.error);
                }

                // Track session ID
                if (data.type === "session.started") {
                  if (mountedRef.current) {
                    setSessionId(data.sessionId);
                  }
                }
              } catch (parseError) {
                logger.error("pipeline_stream.parse_event_failed", { error: String(parseError) });
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setEvents((prev) => [
            ...prev,
            { type: "session.cancelled", reason: "Cancelled by user" },
          ]);
          return;
        }
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStream();
  }, [companyName, companyId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
    setSources([]);
    setGaps([]);
    setError(null);
    setSessionId(null);
    setIsLoading(false);
  }, []);

  return {
    events,
    sources,
    gaps,
    isLoading,
    error,
    sessionId,
    start,
    cancel,
    clear,
  };
}
