"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Settings2,
  FileText,
  Sparkles,
  X,
  BarChart3,
  Shield,
  Activity,
} from "lucide-react";
import { DeepAgentChatLayout } from "./_components/deep-agent-chat-layout";
import { DeepAgentMessageList } from "./_components/deep-agent-message-list";
import { DeepAgentInputBar } from "./_components/deep-agent-input-bar";
import { DeepAgentModelSelector } from "./_components/deep-agent-model-selector";
import { DeepAgentSchemaSelector } from "./_components/deep-agent-schema-selector";
import { DeepAgentDeploymentSettings } from "./_components/deep-agent-deployment-settings";
import { DeepAgentConnectionStatus } from "./_components/deep-agent-connection-status";
import { DeepAgentApprovalDialog } from "./_components/deep-agent-approval-dialog";
import { DeepAgentTaskList } from "./_components/deep-agent-task-list";
import { DeepAgentContextStatus } from "./_components/deep-agent-context-status";
import { DeepAgentShareButton } from "./_components/deep-agent-share-button";
import { DeepAgentTimeline } from "./_components/deep-agent-timeline";
import { DeepAgentMemoryBrowser } from "./_components/deep-agent-memory-browser";
import { DeepAgentSkillBrowser } from "./_components/deep-agent-skill-browser";
import { DeepAgentSettings } from "./_components/deep-agent-settings";
import { DeepAgentInterpreterToggle } from "./_components/deep-agent-interpreter-toggle";
import { DeepAgentMetrics } from "./_components/deep-agent-metrics";
import { DeepAgentBatchApproval } from "./_components/deep-agent-batch-approval";
import { DeepAgentTemplates } from "./_components/deep-agent-templates";
import { DeepAgentCommandPalette } from "./_components/deep-agent-command-palette";
import { DeepAgentTraceViewer } from "./_components/deep-agent-trace-viewer";
import { useDeepAgentStream } from "@/hooks/use-deepagent-stream";
import { logger } from "@/lib/logger";
import type {
  DeepAgentSession,
  DeepAgentMessage,
  DeepAgentStructuredSchema,
  DeepAgentApproval,
  DeepAgentTaskEvent,
  DeepAgentSubagentEvent,
  DeepAgentCompressionEvent,
} from "@/lib/deepagent/types";
import { loadDeploymentConfig, type DeploymentConfig } from "./_components/deep-agent-deployment-settings";

type PanelId = "memory" | "skills" | "settings" | "interpreter" | "metrics" | "batch-approvals" | "trace" | null;

const MAX_MESSAGES = 500;

export default function DeepAgentPage() {
  const [sessions, setSessions] = useState<DeepAgentSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DeepAgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | undefined>();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [selectedSchema, setSelectedSchema] = useState<DeepAgentStructuredSchema | null>(null);
  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfig>(() => loadDeploymentConfig());
  const [activePanel, setActivePanel] = useState<PanelId>(null);

  // New state for Phase 2 features
  const [tasks, setTasks] = useState<DeepAgentTaskEvent[]>([]);
  const [compressionEvents, setCompressionEvents] = useState<DeepAgentCompressionEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<DeepAgentApproval | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const pendingMessageRef = useRef<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const inputBarRef = useRef<HTMLTextAreaElement | null>(null);

  // Derive subagents from the latest assistant message's subagent data
  const subagents = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.subagents && msg.subagents.length > 0) {
        return msg.subagents;
      }
    }
    return [];
  }, [messages]);

  const togglePanel = useCallback((panel: PanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/admin/deepagent/sessions", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setSessions(data.data);
      }
    } catch (error) {
      logger.error("deepagent.sessions_load_failed", { error: String(error) });
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string, cursor?: string) => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      
      const response = await fetch(
        `/api/v1/admin/deepagent/sessions/${sessionId}/messages?${params}`,
        { credentials: "include" }
      );
      if (response.ok) {
        const data = await response.json();
        if (cursor) {
          setMessages((prev) => {
            const combined = [...data.data, ...prev];
            return combined.length > MAX_MESSAGES ? combined.slice(-MAX_MESSAGES) : combined;
          });
        } else {
          setMessages(data.data);
        }
        setHasMoreMessages(data.hasMore);
        setNextCursor(data.nextCursor);
      }
    } catch (error) {
      logger.error("deepagent.messages_load_failed", { sessionId, error: String(error) });
    }
  }, []);

  const handleMessageUpdate = useCallback((messageId: string, update: Partial<DeepAgentMessage>) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, ...update } : m
      )
    );
  }, []);

  const handleStreamComplete = useCallback((messageId: string, finalContent: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content: finalContent, isStreaming: false }
          : m
      )
    );
    setIsStreaming(false);
    setCurrentTool(undefined);
    loadSessions();
  }, [loadSessions]);

  const handleStreamError = useCallback((messageId: string, error: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              content: m.content || error,
              isStreaming: false,
              error: true,
            }
          : m
      )
    );
    setIsStreaming(false);
    setCurrentTool(undefined);
  }, []);

  const handleTaskUpdate = useCallback((_messageId: string, task: DeepAgentTaskEvent) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = task;
        return updated;
      }
      return [...prev, task];
    });
  }, []);

  const handleSubagentEvent = useCallback((_messageId: string, _event: DeepAgentSubagentEvent) => {
    // Subagent state is managed via the hook's internal refs;
    // we read the accumulated state when rendering
  }, []);

  const handleCompression = useCallback((_messageId: string, event: DeepAgentCompressionEvent) => {
    setCompressionEvents((prev) => [...prev, event]);
  }, []);

  const { connectionStatus, startStream, stopStream, reconnect } = useDeepAgentStream({
    sessionId: selectedSessionId,
    onMessageUpdate: handleMessageUpdate,
    onStreamComplete: handleStreamComplete,
    onStreamError: handleStreamError,
    onTaskUpdate: handleTaskUpdate,
    onSubagentEvent: handleSubagentEvent,
    onCompression: handleCompression,
  });

  // Approval handlers
  const handleApprove = useCallback(async (approvalId: string) => {
    setIsApproving(true);
    try {
      await fetch(`/api/v1/admin/deepagent/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
        credentials: "include",
      });
      setPendingApproval(null);
    } catch (error) {
      logger.error("deepagent.approval_failed", { approvalId, error: String(error) });
    } finally {
      setIsApproving(false);
    }
  }, []);

  const handleReject = useCallback(async (approvalId: string) => {
    setIsApproving(true);
    try {
      await fetch(`/api/v1/admin/deepagent/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
        credentials: "include",
      });
      setPendingApproval(null);
    } catch (error) {
      logger.error("deepagent.rejection_failed", { approvalId, error: String(error) });
    } finally {
      setIsApproving(false);
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!selectedSessionId || !hasMoreMessages || isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);
    await loadMessages(selectedSessionId, nextCursor);
    setIsLoadingMore(false);
  }, [selectedSessionId, hasMoreMessages, isLoadingMore, nextCursor, loadMessages]);

  useEffect(() => {
    const init = async () => {
      await loadSessions();
    };
    init();
  }, [loadSessions]);

  useEffect(() => {
    const loadSessionData = async () => {
      if (selectedSessionId) {
        await loadMessages(selectedSessionId);
      } else {
        setMessages([]);
      }
    };
    loadSessionData();
  }, [selectedSessionId, loadMessages]);

  const handleNewSession = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/admin/deepagent/sessions", {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat", model: selectedModel }),
      });

      if (response.ok) {
        const data = await response.json();
        const newSession = data.data;
        setSessions((prev) => [newSession, ...prev]);
        setSelectedSessionId(newSession.id);
        return newSession.id;
      }
    } catch (error) {
      logger.error("deepagent.session_create_failed", { error: String(error) });
    }
    return null;
  }, [selectedModel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Cmd/Ctrl+K: Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Cmd/Ctrl+N: New session
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        handleNewSession();
        return;
      }

      // Cmd/Ctrl+Shift+M: Toggle memory browser
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "M") {
        e.preventDefault();
        togglePanel("memory");
        return;
      }

      // Cmd/Ctrl+Shift+S: Toggle skill browser
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        togglePanel("skills");
        return;
      }

      // Cmd/Ctrl+Shift+T: Toggle templates
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setShowTemplates(true);
        return;
      }

      // Cmd/Ctrl+Shift+E: Export conversation
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "E") {
        e.preventDefault();
        // Trigger export via a custom event
        window.dispatchEvent(new CustomEvent("deepagent:export"));
        return;
      }

      // Cmd/Ctrl+Shift+I: Focus input bar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "I") {
        e.preventDefault();
        inputBarRef.current?.focus();
        return;
      }

      // Escape: Close modals/panels (only if not in input)
      if (e.key === "Escape" && !isInput) {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (activePanel) {
          setActivePanel(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNewSession, togglePanel, commandPaletteOpen, activePanel]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const response = await fetch(
          `/api/v1/admin/deepagent/sessions/${sessionId}`,
          {
credentials: "include", method: "DELETE" }
        );

        if (response.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          if (selectedSessionId === sessionId) {
            setSelectedSessionId(null);
          }
        }
      } catch (error) {
        logger.error("deepagent.session_delete_failed", { sessionId, error: String(error) });
      }
    },
    [selectedSessionId]
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      let sessionId = selectedSessionId;

      if (!sessionId) {
        const newId = await handleNewSession();
        if (!newId) return;
        sessionId = newId;
        pendingMessageRef.current = content;
        return;
      }

      const userMessage: DeepAgentMessage = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      const assistantMessageId = `temp-assistant-${Date.now()}`;
      const assistantMessage: DeepAgentMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        fileChanges: [],
      };

      setMessages((prev) => {
        const updated = [...prev, userMessage, assistantMessage];
        return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
      });
      setIsStreaming(true);
      startStream(content, assistantMessageId);
    },
    [selectedSessionId, handleNewSession, startStream]
  );

  useEffect(() => {
    if (
      pendingMessageRef.current &&
      selectedSessionId &&
      messages.length === 0
    ) {
      const content = pendingMessageRef.current;
      pendingMessageRef.current = null;

      const userMessage: DeepAgentMessage = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      const assistantMessageId = `temp-assistant-${Date.now()}`;
      const assistantMessage: DeepAgentMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        fileChanges: [],
      };

      setMessages([userMessage, assistantMessage]);
      setIsStreaming(true);
      startStream(content, assistantMessageId);
    }
  }, [selectedSessionId, messages.length, startStream]);

  const handleStopStreaming = useCallback(() => {
    stopStream();
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      )
    );
    setIsStreaming(false);
    setCurrentTool(undefined);
  }, [stopStream]);

  const handleRetryMessage = useCallback(
    async (messageId: string) => {
      if (!selectedSessionId) return;

      const failedMessage = messages.find((m) => m.id === messageId);
      if (!failedMessage) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      let previousUserMessage: DeepAgentMessage | null = null;
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          previousUserMessage = messages[i];
          break;
        }
      }

      if (!previousUserMessage) return;

      try {
        await fetch(
          `/api/v1/admin/deepagent/sessions/${selectedSessionId}/messages/${messageId}`,
          {
credentials: "include", method: "DELETE" }
        );
      } catch (error) {
        logger.error("deepagent.message_delete_failed", { messageId, error: String(error) });
      }

      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      const assistantMessageId = `temp-assistant-${Date.now()}`;
      const assistantMessage: DeepAgentMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        fileChanges: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);
      startStream(previousUserMessage.content, assistantMessageId);
    },
    [selectedSessionId, messages, startStream]
  );

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!selectedSessionId) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const messagesToDelete = messages.slice(messageIndex + 1);
      for (const msg of messagesToDelete) {
        try {
          await fetch(
            `/api/v1/admin/deepagent/sessions/${selectedSessionId}/messages/${msg.id}`,
            {
credentials: "include", method: "DELETE" }
          );
        } catch (error) {
          logger.error("deepagent.message_delete_failed", { messageId: msg.id, error: String(error) });
        }
      }

      setMessages((prev) =>
        prev.slice(0, messageIndex + 1).map((m) =>
          m.id === messageId ? { ...m, content: newContent } : m
        )
      );

      const assistantMessageId = `temp-assistant-${Date.now()}`;
      const assistantMessage: DeepAgentMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        fileChanges: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);
      startStream(newContent, assistantMessageId);
    },
    [selectedSessionId, messages, startStream]
  );

  const handleRegenerateMessage = useCallback(
    async (messageId: string) => {
      if (!selectedSessionId) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      let previousUserMessage: DeepAgentMessage | null = null;
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          previousUserMessage = messages[i];
          break;
        }
      }

      if (!previousUserMessage) return;

      try {
        await fetch(
          `/api/v1/admin/deepagent/sessions/${selectedSessionId}/messages/${messageId}`,
          {
credentials: "include", method: "DELETE" }
        );
      } catch (error) {
        logger.error("deepagent.message_delete_failed", { messageId, error: String(error) });
        return;
      }

      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      const assistantMessageId = `temp-assistant-${Date.now()}`;
      const assistantMessage: DeepAgentMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolCalls: [],
        fileChanges: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);
      startStream(previousUserMessage.content, assistantMessageId);
    },
    [selectedSessionId, messages, startStream]
  );

  return (
    <DeepAgentChatLayout
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      onSelectSession={setSelectedSessionId}
      onNewSession={handleNewSession}
      onDeleteSession={handleDeleteSession}
      messages={messages}
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-border px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
          {/* Primary controls group */}
          <DeepAgentModelSelector
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={isStreaming}
          />
          <DeepAgentSchemaSelector
            selectedSchemaId={selectedSchema?.id ?? null}
            onSelectSchema={setSelectedSchema}
            disabled={isStreaming}
          />
          <DeepAgentDeploymentSettings
            config={deploymentConfig}
            onConfigChange={setDeploymentConfig}
          />

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          {/* Utility buttons group */}
            <Button
              variant={activePanel === "interpreter" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => togglePanel("interpreter")}
              title="Code Interpreter"
            >
              <span className="hidden sm:inline">Interpreter</span>
            </Button>

            <Button
              variant={activePanel === "metrics" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => togglePanel("metrics")}
              title="Performance Metrics"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Metrics</span>
            </Button>

            <Button
              variant={activePanel === "batch-approvals" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => togglePanel("batch-approvals")}
              title="Batch Approvals"
            >
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Batch Approvals</span>
            </Button>

            <Button
              variant={activePanel === "trace" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => togglePanel("trace")}
              title="Execution Trace"
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Trace</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setShowTemplates(true)}
              title="Session Templates"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Templates</span>
            </Button>

          {compressionEvents.length > 0 && (
            <DeepAgentContextStatus compressionEvents={compressionEvents} />
          )}

          <div className="flex-1" />

          {/* Action buttons group */}
          <div className="flex items-center gap-0.5">
            <Button
              variant={activePanel === "memory" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => togglePanel("memory")}
              title="Memory Files"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant={activePanel === "skills" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => togglePanel("skills")}
              title="Skill Browser"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant={activePanel === "settings" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => togglePanel("settings")}
              title="Settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>

            <DeepAgentShareButton sessionId={selectedSessionId} />
            <DeepAgentTimeline sessionId={selectedSessionId} />
          </div>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          <DeepAgentConnectionStatus
            status={connectionStatus}
            onReconnect={reconnect}
          />
        </div>

        {/* Task list (above messages, collapsible) */}
        {tasks.length > 0 && (
          <div className="px-3 pt-2">
            <DeepAgentTaskList tasks={tasks} />
          </div>
        )}

        {/* Message list */}
        <DeepAgentMessageList
          messages={messages}
          isStreaming={isStreaming}
          currentTool={currentTool}
          onLoadMore={handleLoadMore}
          hasMore={hasMoreMessages}
          isLoadingMore={isLoadingMore}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onRetryMessage={handleRetryMessage}
          subagents={subagents}
        />

        {/* Collapsible panels */}
        {activePanel === "memory" && (
          <div className="max-h-[300px] relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <DeepAgentMemoryBrowser />
          </div>
        )}

        {activePanel === "skills" && (
          <div className="max-h-[300px] relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <DeepAgentSkillBrowser />
          </div>
        )}

        {activePanel === "settings" && (
          <div className="max-h-[300px] overflow-y-auto relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <DeepAgentSettings />
          </div>
        )}

        {activePanel === "interpreter" && (
          <div className="max-h-[200px] overflow-y-auto relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <DeepAgentInterpreterToggle />
          </div>
        )}

        {activePanel === "metrics" && (
          <div className="max-h-[600px] overflow-y-auto relative border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <div className="p-4">
              <DeepAgentMetrics sessionId={selectedSessionId} />
            </div>
          </div>
        )}

        {activePanel === "batch-approvals" && (
          <div className="max-h-[600px] overflow-y-auto relative border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <div className="p-4">
              <DeepAgentBatchApproval sessionId={selectedSessionId} />
            </div>
          </div>
        )}

        {activePanel === "trace" && (
          <div className="max-h-[600px] overflow-y-auto relative border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 z-10 h-6 w-6 p-0"
              onClick={() => setActivePanel(null)}
            >
              <X className="h-3 w-3" />
            </Button>
            <div className="p-4">
              <DeepAgentTraceViewer sessionId={selectedSessionId} />
            </div>
          </div>
        )}

        {/* Input bar */}
        <DeepAgentInputBar
          onSend={handleSendMessage}
          onStop={handleStopStreaming}
          isStreaming={isStreaming}
          disabled={!selectedSessionId && isStreaming}
        />
      </div>

      {/* Approval dialog overlay */}
      <DeepAgentApprovalDialog
        approval={pendingApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        isProcessing={isApproving}
      />

      {/* Templates modal */}
      <DeepAgentTemplates
        open={showTemplates}
        onOpenChange={setShowTemplates}
      />

      {/* Command palette */}
      <DeepAgentCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        actions={{
          onNewSession: handleNewSession,
          onToggleMemory: () => togglePanel("memory"),
          onToggleSkills: () => togglePanel("skills"),
          onToggleMetrics: () => togglePanel("metrics"),
          onToggleBatchApprovals: () => togglePanel("batch-approvals"),
          onToggleTrace: () => togglePanel("trace"),
          onToggleInterpreter: () => togglePanel("interpreter"),
          onOpenTemplates: () => setShowTemplates(true),
          onExportConversation: () => window.dispatchEvent(new CustomEvent("deepagent:export")),
          onShareConversation: () => {/* handled by share button */},
          onClearMessages: () => setMessages([]),
          onFocusInput: () => inputBarRef.current?.focus(),
          onOpenSettings: () => togglePanel("settings"),
        }}
      />
    </DeepAgentChatLayout>
  );
}
