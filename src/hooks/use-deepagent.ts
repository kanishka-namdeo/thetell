"use client";

/**
 * React hook for DeepAgent streaming
 * 
 * Provides a useStream-compatible interface for connecting to DeepAgent,
 * handling streaming events, and managing conversation state.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { DeepAgentMessage, DeepAgentToolCall } from "@/lib/deepagent/types";
import { logger } from "@/lib/logger";

export interface UseDeepAgentOptions {
  /** Session/thread ID */
  threadId: string | null;
  /** Whether to connect immediately */
  autoConnect?: boolean;
  /** Callback when connection is established */
  onConnect?: () => void;
  /** Callback when connection is closed */
  onDisconnect?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseDeepAgentReturn {
  /** Current messages in the conversation */
  messages: DeepAgentMessage[];
  /** Whether currently connected/streaming */
  isLoading: boolean;
  /** Connection status */
  isConnected: boolean;
  /** Current tool calls being executed */
  toolCalls: DeepAgentToolCall[];
  /** Connect to the agent */
  connect: () => void;
  /** Disconnect from the agent */
  disconnect: () => void;
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;
  /** Clear all messages */
  clearMessages: () => void;
  /** Last error if any */
  error: Error | null;
}

/**
 * Hook for managing DeepAgent streaming conversations
 */
const MAX_MESSAGES = 500;

export function useDeepAgent(options: UseDeepAgentOptions): UseDeepAgentReturn {
  const { threadId, autoConnect = false, onConnect, onDisconnect, onError } = options;

  const [messages, setMessages] = useState<DeepAgentMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<DeepAgentToolCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const isLoadingRef = useRef(false);

  // Store callbacks in refs to avoid stale closures
  const onConnectRef = useRef(onConnect);
  const onErrorRef = useRef(onError);
  const onDisconnectRef = useRef(onDisconnect);
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);

  /**
   * Connect to the DeepAgent stream
   */
  const connect = useCallback(() => {
    if (!threadId) {
      logger.warn("deepagent.connect_no_thread_id");
      return;
    }

    if (eventSourceRef.current) {
      logger.debug("deepagent.connect_closing_existing");
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/v1/admin/deepagent/stream?sessionId=${threadId}`,
      { withCredentials: true }
    );

    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      if (!mountedRef.current) return;
      logger.debug("deepagent.stream_connected");
      setIsConnected(true);
      setError(null);
      onConnectRef.current?.();
    });

    eventSource.addEventListener("connected", (event) => {
      if (!mountedRef.current) return;
      const data = JSON.parse(event.data);
      logger.debug("deepagent.stream_ready", data);
      assistantMessageIdRef.current = data.messageId;
    });

    eventSource.addEventListener("text", (event) => {
      if (!mountedRef.current) return;
      const data = JSON.parse(event.data);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, content: lastMsg.content + data.text },
          ];
        }
        return [
          ...prev,
          {
            id: assistantMessageIdRef.current || `msg-${Date.now()}`,
            role: "assistant",
            content: data.text,
            timestamp: new Date().toISOString(),
            isStreaming: true,
          },
        ];
      });
    });

    eventSource.addEventListener("tool_call", (event) => {
      if (!mountedRef.current) return;
      const data = JSON.parse(event.data);
      setToolCalls((prev) => [...prev, ...data.toolCalls]);
    });

    eventSource.addEventListener("tool_result", (event) => {
      if (!mountedRef.current) return;
      const data = JSON.parse(event.data);
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.id === data.id ? { ...tc, ...data, status: data.success ? "completed" : "error" } : tc
        )
      );
    });

    eventSource.addEventListener("done", (event) => {
      if (!mountedRef.current) return;
      const data = JSON.parse(event.data);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        let updated = prev;
        if (lastMsg?.role === "assistant") {
          updated = [
            ...prev.slice(0, -1),
            { ...lastMsg, id: data.messageId, isStreaming: false },
          ];
        }
        if (updated.length > MAX_MESSAGES) {
          return updated.slice(updated.length - MAX_MESSAGES);
        }
        return updated;
      });
      setIsLoading(false);
      isLoadingRef.current = false;
      setToolCalls([]);
      eventSource.close();
    });

    eventSource.addEventListener("error", (event: MessageEvent | Event) => {
      if (!mountedRef.current) return;
      let errorMessage = "Stream error";
      try {
        if ("data" in event && event.data) {
          const data = JSON.parse(event.data);
          errorMessage = data.error || errorMessage;
        }
      } catch {
        // Use default message
      }
      setError(new Error(errorMessage));
      setIsLoading(false);
      isLoadingRef.current = false;
      setIsConnected(false);
      setToolCalls([]);
      onErrorRef.current?.(new Error(errorMessage));
      eventSource.close();
    });

    eventSource.onerror = () => {
      if (!mountedRef.current) return;
      logger.error("deepagent.stream_connection_error");
      setIsConnected(false);
      setIsLoading(false);
      isLoadingRef.current = false;
      setToolCalls([]);
      eventSource.close();
    };
  }, [threadId]);

  /**
   * Disconnect from the stream
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setIsLoading(false);
    isLoadingRef.current = false;
    setToolCalls([]);
    onDisconnectRef.current?.();
  }, []);

  /**
   * Send a message to the agent
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!threadId) {
        throw new Error("Cannot send message: no threadId");
      }

      if (isLoadingRef.current) {
        logger.warn("deepagent.send_already_loading");
        return;
      }

      // Add user message
      const userMessage: DeepAgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      // Add placeholder for assistant response
      const assistantMessage: DeepAgentMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      isLoadingRef.current = true;
      setError(null);

      // Close any existing EventSource before creating a new one
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Connect to stream with the message
      const eventSource = new EventSource(
        `/api/v1/admin/deepagent/stream?sessionId=${threadId}&message=${encodeURIComponent(content)}`,
        { withCredentials: true }
      );

      eventSourceRef.current = eventSource;

      eventSource.addEventListener("connected", (event) => {
        if (!mountedRef.current) return;
        const data = JSON.parse(event.data);
        assistantMessageIdRef.current = data.messageId;
        setIsConnected(true);
      });

      eventSource.addEventListener("text", (event) => {
        if (!mountedRef.current) return;
        const data = JSON.parse(event.data);
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + data.text },
            ];
          }
          return prev;
        });
      });

      eventSource.addEventListener("tool_call", (event) => {
        if (!mountedRef.current) return;
        const data = JSON.parse(event.data);
        setToolCalls((prev) => [...prev, ...data.toolCalls]);
      });

      eventSource.addEventListener("tool_result", (event) => {
        if (!mountedRef.current) return;
        const data = JSON.parse(event.data);
        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.id === data.id ? { ...tc, ...data, status: data.success ? "completed" : "error" } : tc
          )
        );
      });

      eventSource.addEventListener("done", (event) => {
        if (!mountedRef.current) return;
        const data = JSON.parse(event.data);
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          let updated = prev;
          if (lastMsg?.role === "assistant") {
            updated = [
              ...prev.slice(0, -1),
              { ...lastMsg, id: data.messageId, isStreaming: false },
            ];
          }
          if (updated.length > MAX_MESSAGES) {
            return updated.slice(updated.length - MAX_MESSAGES);
          }
          return updated;
        });
        setIsLoading(false);
        isLoadingRef.current = false;
        setIsConnected(false);
        setToolCalls([]);
        eventSource.close();
      });

      eventSource.addEventListener("error", (event) => {
        if (!mountedRef.current) return;
        let errorMessage = "Stream error";
        try {
          const messageEvent = event as MessageEvent;
          const data = JSON.parse(messageEvent.data);
          errorMessage = data.error || errorMessage;
        } catch {
          // Use default message
        }
        setError(new Error(errorMessage));
        setIsLoading(false);
        isLoadingRef.current = false;
        setIsConnected(false);
        setToolCalls([]);
        onErrorRef.current?.(new Error(errorMessage));
        eventSource.close();
      });

      eventSource.onerror = () => {
        if (!mountedRef.current) return;
        logger.error("deepagent.stream_connection_error");
        setIsConnected(false);
        setIsLoading(false);
        isLoadingRef.current = false;
        setToolCalls([]);
        eventSource.close();
      };
    },
    [threadId]
  );

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
    setError(null);
  }, []);

  // Auto-connect if requested
  useEffect(() => {
    if (autoConnect && threadId && !isConnected && !isLoading) {
      connect();
    }
  }, [autoConnect, threadId, isConnected, isLoading, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    messages,
    isLoading,
    isConnected,
    toolCalls,
    connect,
    disconnect,
    sendMessage,
    clearMessages,
    error,
  };
}
