"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DeepAgentToolCall,
  DeepAgentFileChange,
  DeepAgentToolCallStatus,
  DeepAgentFileChangeType,
  DeepAgentStructuredResponse,
  DeepAgentTaskEvent,
  DeepAgentSubagentEvent,
  DeepAgentSubagentMessage,
  DeepAgentSubagentStatus,
  DeepAgentToolCall as DeepAgentSubagentToolCall,
  DeepAgentCompressionEvent,
  DeepAgentCompressionType,
} from "@/lib/deepagent/types";
import { logger } from "@/lib/logger";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface StreamMessage {
  id: string;
  content: string;
  toolCalls: DeepAgentToolCall[];
  fileChanges: DeepAgentFileChange[];
  structuredResponse?: DeepAgentStructuredResponse;
  tasks: DeepAgentTaskEvent[];
  subagents: DeepAgentSubagentEvent[];
  compressionEvents: DeepAgentCompressionEvent[];
  isStreaming: boolean;
  error?: boolean;
}

interface UseDeepAgentStreamOptions {
  sessionId: string | null;
  onMessageUpdate: (messageId: string, update: Partial<StreamMessage>) => void;
  onStreamComplete: (messageId: string, finalContent: string) => void;
  onStreamError: (messageId: string, error: string) => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onTaskUpdate?: (messageId: string, task: DeepAgentTaskEvent) => void;
  onSubagentEvent?: (messageId: string, event: DeepAgentSubagentEvent) => void;
  onCompression?: (messageId: string, event: DeepAgentCompressionEvent) => void;
}

interface UseDeepAgentStreamReturn {
  connectionStatus: ConnectionStatus;
  startStream: (message: string, assistantMessageId: string) => void;
  stopStream: () => void;
  reconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;
const MAX_SEEN_EVENTS = 1000;

export function useDeepAgentStream({
  sessionId,
  onMessageUpdate,
  onStreamComplete,
  onStreamError,
  onConnectionStatusChange,
  onTaskUpdate,
  onSubagentEvent,
  onCompression,
}: UseDeepAgentStreamOptions): UseDeepAgentStreamReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenSeqRef = useRef(0);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const currentMessageIdRef = useRef<string | null>(null);
  const accumulatedContentRef = useRef("");
  const toolCallsRef = useRef<DeepAgentToolCall[]>([]);
  const fileChangesRef = useRef<DeepAgentFileChange[]>([]);
  const doneReceivedRef = useRef(false);
  const tasksRef = useRef<Map<string, DeepAgentTaskEvent>>(new Map());
  const subagentsRef = useRef<Map<string, DeepAgentSubagentEvent>>(new Map());
  const compressionEventsRef = useRef<DeepAgentCompressionEvent[]>([]);
  const mountedRef = useRef(true); // Track if component is mounted

  // Store callback props in refs to avoid stale closures and dependency cycles
  const onMessageUpdateRef = useRef(onMessageUpdate);
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamErrorRef = useRef(onStreamError);
  const onConnectionStatusChangeRef = useRef(onConnectionStatusChange);
  const onTaskUpdateRef = useRef(onTaskUpdate);
  const onSubagentEventRef = useRef(onSubagentEvent);
  const onCompressionRef = useRef(onCompression);
  useEffect(() => { onMessageUpdateRef.current = onMessageUpdate; }, [onMessageUpdate]);
  useEffect(() => { onStreamCompleteRef.current = onStreamComplete; }, [onStreamComplete]);
  useEffect(() => { onStreamErrorRef.current = onStreamError; }, [onStreamError]);
  useEffect(() => { onConnectionStatusChangeRef.current = onConnectionStatusChange; }, [onConnectionStatusChange]);
  useEffect(() => { onTaskUpdateRef.current = onTaskUpdate; }, [onTaskUpdate]);
  useEffect(() => { onSubagentEventRef.current = onSubagentEvent; }, [onSubagentEvent]);
  useEffect(() => { onCompressionRef.current = onCompression; }, [onCompression]);

  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    onConnectionStatusChangeRef.current?.(status);
  }, []);

  const cleanupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Use ref to allow handleReconnect to call the latest startStreamInternal
  const startStreamInternalRef = useRef<
    ((sessionId: string, assistantMessageId: string, isReconnect?: boolean) => void) | null
  >(null);

  const handleReconnect = useCallback(() => {
    if (!sessionId || !currentMessageIdRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      updateConnectionStatus("disconnected");
      return;
    }

    reconnectAttemptsRef.current++;
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
      30000
    );

    updateConnectionStatus("reconnecting");

    reconnectTimerRef.current = setTimeout(() => {
      if (sessionId && currentMessageIdRef.current && startStreamInternalRef.current) {
        startStreamInternalRef.current(sessionId, currentMessageIdRef.current, true);
      }
    }, delay);
  }, [sessionId, updateConnectionStatus]);

  const startStreamInternal = useCallback((
    sid: string,
    assistantMessageId: string,
    isReconnect = false
  ) => {
    cleanupEventSource();

    if (!isReconnect) {
      reconnectAttemptsRef.current = 0;
      lastSeenSeqRef.current = 0;
      seenEventIdsRef.current.clear();
      // Note: accumulatedContentRef is NOT cleared here — startStream()
      // already set it to the user's message before calling this function.
      toolCallsRef.current = [];
      fileChangesRef.current = [];
      doneReceivedRef.current = false;
      tasksRef.current.clear();
      subagentsRef.current.clear();
      compressionEventsRef.current = [];
    }

    currentMessageIdRef.current = assistantMessageId;
    updateConnectionStatus("connecting");

    const params = new URLSearchParams({
      sessionId: sid,
      message: accumulatedContentRef.current || "RECONNECT",
    });

    if (isReconnect && lastSeenSeqRef.current > 0) {
      params.set("since", String(lastSeenSeqRef.current));
    }

    const eventSource = new EventSource(
      `/api/v1/admin/deepagent/stream?${params}`,
      { withCredentials: true }
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      if (!mountedRef.current) return;
      updateConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;
    });

    eventSource.addEventListener("text", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.text) {
          accumulatedContentRef.current += data.text;
          onMessageUpdateRef.current(assistantMessageId, {
            content: accumulatedContentRef.current,
          });
        }
      } catch {
        logger.error("deepagent.parse_text_event_failed");
      }
    });

    eventSource.addEventListener("tool_call", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.toolCalls) {
          for (const tc of data.toolCalls) {
            const existing = toolCallsRef.current.findIndex((t) => t.id === tc.id);
            if (existing >= 0) {
              toolCallsRef.current[existing] = {
                ...toolCallsRef.current[existing],
                ...tc,
                status: tc.status as DeepAgentToolCallStatus,
              };
            } else {
              toolCallsRef.current.push({
                ...tc,
                status: tc.status as DeepAgentToolCallStatus,
              });
            }
          }
          onMessageUpdateRef.current(assistantMessageId, {
            toolCalls: [...toolCallsRef.current],
          });
        }
      } catch {
        logger.error("deepagent.parse_tool_call_event_failed");
      }
    });

    eventSource.addEventListener("structured_response", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        const structuredResponse: DeepAgentStructuredResponse = {
          schemaId: data.schemaId,
          schemaName: data.schemaName,
          data: data.data,
          timestamp: new Date().toISOString(),
        };
        onMessageUpdateRef.current(assistantMessageId, { structuredResponse });
      } catch {
        logger.error("deepagent.parse_structured_response_event_failed");
      }
    });

    eventSource.addEventListener("file_change", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.fileChanges) {
          for (const fc of data.fileChanges) {
            fileChangesRef.current.push({
              ...fc,
              type: fc.type as DeepAgentFileChangeType,
            });
          }
          onMessageUpdateRef.current(assistantMessageId, {
            fileChanges: [...fileChangesRef.current],
          });
        }
      } catch {
        logger.error("deepagent.parse_file_change_event_failed");
      }
    });

    // --- New event listeners for Phase 1 ---

    eventSource.addEventListener("task_update", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.task) {
          const task: DeepAgentTaskEvent = {
            id: data.task.id,
            content: data.task.content,
            status: data.task.status,
            createdAt: data.task.createdAt,
            updatedAt: data.task.updatedAt,
          };
          tasksRef.current.set(task.id, task);
          onMessageUpdateRef.current(assistantMessageId, {
            tasks: Array.from(tasksRef.current.values()),
          });
          onTaskUpdateRef.current?.(assistantMessageId, task);
        }
      } catch {
        logger.error("deepagent.parse_task_update_event_failed");
      }
    });

    eventSource.addEventListener("subagent_start", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.id) {
          const subagent: DeepAgentSubagentEvent = {
            id: data.id,
            name: data.name || "unknown",
            status: "started",
            messages: [],
            toolCalls: [],
          };
          subagentsRef.current.set(subagent.id, subagent);
          onMessageUpdateRef.current(assistantMessageId, {
            subagents: Array.from(subagentsRef.current.values()),
          });
          onSubagentEventRef.current?.(assistantMessageId, subagent);
        }
      } catch {
        logger.error("deepagent.parse_subagent_start_event_failed");
      }
    });

    eventSource.addEventListener("subagent_text", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.subagentId && data.text) {
          const subagent = subagentsRef.current.get(data.subagentId);
          if (subagent) {
            const msg: DeepAgentSubagentMessage = {
              id: `sa-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: "assistant",
              content: data.text,
              timestamp: new Date().toISOString(),
            };
            subagent.messages.push(msg);
            subagent.status = "running";
            onMessageUpdateRef.current(assistantMessageId, {
              subagents: Array.from(subagentsRef.current.values()),
            });
          }
        }
      } catch {
        logger.error("deepagent.parse_subagent_text_event_failed");
      }
    });

    eventSource.addEventListener("subagent_tool_call", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.subagentId) {
          const subagent = subagentsRef.current.get(data.subagentId);
          if (subagent) {
            const toolCall: DeepAgentSubagentToolCall = {
              id: data.id,
              name: data.name,
              input: data.input,
              status: data.status as DeepAgentToolCallStatus,
            };
            const existing = subagent.toolCalls.findIndex((t) => t.id === data.id);
            if (existing >= 0) {
              subagent.toolCalls[existing] = toolCall;
            } else {
              subagent.toolCalls.push(toolCall);
            }
            onMessageUpdateRef.current(assistantMessageId, {
              subagents: Array.from(subagentsRef.current.values()),
            });
          }
        }
      } catch {
        logger.error("deepagent.parse_subagent_tool_call_event_failed");
      }
    });

    eventSource.addEventListener("subagent_tool_result", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.subagentId) {
          const subagent = subagentsRef.current.get(data.subagentId);
          if (subagent) {
            const existing = subagent.toolCalls.findIndex((t) => t.id === data.id);
            if (existing >= 0) {
              subagent.toolCalls[existing] = {
                ...subagent.toolCalls[existing],
                output: data.output,
                status: (data.success ? "completed" : "error") as DeepAgentToolCallStatus,
                duration: data.duration,
              };
            }
            onMessageUpdateRef.current(assistantMessageId, {
              subagents: Array.from(subagentsRef.current.values()),
            });
          }
        }
      } catch {
        logger.error("deepagent.parse_subagent_tool_result_event_failed");
      }
    });

    eventSource.addEventListener("subagent_complete", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        if (data.id) {
          const subagent = subagentsRef.current.get(data.id);
          if (subagent) {
            subagent.status = data.status as DeepAgentSubagentStatus;
            onMessageUpdateRef.current(assistantMessageId, {
              subagents: Array.from(subagentsRef.current.values()),
            });
            onSubagentEventRef.current?.(assistantMessageId, subagent);
          }
        }
      } catch {
        logger.error("deepagent.parse_subagent_complete_event_failed");
      }
    });

    eventSource.addEventListener("compression", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        const compressionEvent: DeepAgentCompressionEvent = {
          type: data.compressionType as DeepAgentCompressionType,
          trigger: data.trigger,
          tokensSaved: data.tokensSaved,
          timestamp: new Date().toISOString(),
          filePath: data.filePath,
        };
        compressionEventsRef.current.push(compressionEvent);
        onMessageUpdateRef.current(assistantMessageId, {
          compressionEvents: [...compressionEventsRef.current],
        });
        onCompressionRef.current?.(assistantMessageId, compressionEvent);
      } catch {
        logger.error("deepagent.parse_compression_event_failed");
      }
    });

    // --- End new event listeners ---

    eventSource.addEventListener("done", (event) => {
      if (!mountedRef.current) return;
      try {
        doneReceivedRef.current = true;
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;

        onStreamCompleteRef.current(assistantMessageId, data.content || accumulatedContentRef.current);
        updateConnectionStatus("disconnected");
        cleanupEventSource();
      } catch {
        logger.error("deepagent.parse_done_event_failed");
      }
    });

    eventSource.addEventListener("error", (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data._seq) lastSeenSeqRef.current = data._seq;
        if (data._eventId && seenEventIdsRef.current.has(data._eventId)) return;
        if (data._eventId) {
          if (seenEventIdsRef.current.size >= MAX_SEEN_EVENTS) {
            const arr = Array.from(seenEventIdsRef.current);
            seenEventIdsRef.current = new Set(arr.slice(arr.length / 2));
          }
          seenEventIdsRef.current.add(data._eventId);
        }

        const errorMessage = data.error || "Stream error";
        onStreamErrorRef.current(assistantMessageId, errorMessage);
        updateConnectionStatus("disconnected");
        cleanupEventSource();
      } catch {
        onStreamErrorRef.current(assistantMessageId, "Stream error");
        updateConnectionStatus("disconnected");
        cleanupEventSource();
      }
    });

    eventSource.onerror = () => {
      if (!mountedRef.current) return;
      if (doneReceivedRef.current) {
        updateConnectionStatus("disconnected");
        return;
      }

      cleanupEventSource();
      handleReconnect();
    };
  }, [cleanupEventSource, updateConnectionStatus, handleReconnect]);

  // Keep ref in sync
  useEffect(() => {
    startStreamInternalRef.current = startStreamInternal;
  }, [startStreamInternal]);

  const startStream = useCallback((message: string, assistantMessageId: string) => {
    if (!sessionId) return;
    accumulatedContentRef.current = message;
    startStreamInternal(sessionId, assistantMessageId, false);
  }, [sessionId, startStreamInternal]);

  const stopStream = useCallback(() => {
    cleanupEventSource();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Clear accumulated refs on manual stop
    seenEventIdsRef.current.clear();
    tasksRef.current.clear();
    subagentsRef.current.clear();
    compressionEventsRef.current = [];
    accumulatedContentRef.current = "";
    toolCallsRef.current = [];
    fileChangesRef.current = [];
    currentMessageIdRef.current = null;
    updateConnectionStatus("disconnected");
  }, [cleanupEventSource, updateConnectionStatus]);

  const reconnect = useCallback(() => {
    if (!sessionId || !currentMessageIdRef.current) return;
    reconnectAttemptsRef.current = 0;
    startStreamInternal(sessionId, currentMessageIdRef.current, true);
  }, [sessionId, startStreamInternal]);

  useEffect(() => {
    return () => {
      // Mark as unmounted first to prevent async callbacks from updating state
      mountedRef.current = false;
      cleanupEventSource();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      // Clean up accumulated refs to prevent memory growth
      // Note: Refs are cleared on unmount for defensive memory management
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seenEventIdsRef.current.clear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tasksRef.current.clear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      subagentsRef.current.clear();
      compressionEventsRef.current = [];
      accumulatedContentRef.current = "";
      toolCallsRef.current = [];
      fileChangesRef.current = [];
    };
  }, [cleanupEventSource]);

  return {
    connectionStatus,
    startStream,
    stopStream,
    reconnect,
  };
}
