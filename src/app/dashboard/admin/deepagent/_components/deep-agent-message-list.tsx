"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User,
  Bot,
  Info,
  AlertCircle,
  Pencil,
  RefreshCw,
  Loader2,
  RotateCcw,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeepAgentMarkdownContent } from "./deep-agent-markdown-content";
import { DeepAgentToolCallCard } from "./deep-agent-tool-call-card";
import { DeepAgentFileChangeCard } from "./deep-agent-file-change-card";
import { DeepAgentStreamingIndicator } from "./deep-agent-streaming-indicator";
import { DeepAgentTokenDisplay } from "./deep-agent-token-display";
import { DeepAgentStructuredOutput } from "./deep-agent-structured-output";
import { DeepAgentSubagentCard } from "./deep-agent-subagent-card";
import type { DeepAgentMessage, DeepAgentSubagentEvent } from "@/lib/deepagent/types";

interface DeepAgentMessageListProps {
  messages: DeepAgentMessage[];
  isStreaming?: boolean;
  currentTool?: string;
  className?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  subagents?: DeepAgentSubagentEvent[];
}

function getRoleIcon(role: string) {
  switch (role) {
    case "user":
      return <User className="h-4 w-4" />;
    case "assistant":
      return <Bot className="h-4 w-4" />;
    case "system":
      return <Info className="h-4 w-4" />;
    default:
      return null;
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case "user":
      return "bg-black text-white dark:bg-white dark:text-black";
    case "assistant":
      return "bg-card border border-border";
    case "system":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-card";
  }
}

function getRoleAlignment(role: string) {
  return role === "user" ? "justify-end" : "justify-start";
}

interface SearchMatch {
  messageId: string;
  index: number;
}

export function DeepAgentMessageList({
  messages,
  isStreaming,
  currentTool,
  className,
  onLoadMore,
  hasMore,
  isLoadingMore,
  onEditMessage,
  onRegenerateMessage,
  onRetryMessage,
  subagents = [],
}: DeepAgentMessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastMessageCountRef = useRef(messages.length);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup message refs and timeout on unmount for defensive memory management
  useEffect(() => {
    return () => {
      messageRefs.current.clear();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const matches: SearchMatch[] = [];
    messages.forEach((msg) => {
      if (msg.content && msg.content.toLowerCase().includes(query)) {
        matches.push({ messageId: msg.id, index: matches.length });
      }
    });
    return matches;
  }, [messages, searchQuery]);

  const currentMatch = searchMatches[currentMatchIndex] ?? null;

  // Reset match index when search query changes
  useEffect(() => {
    if (searchQuery && currentMatchIndex >= searchMatches.length) {
      setCurrentMatchIndex(0);
    }
  }, [searchQuery, searchMatches.length, currentMatchIndex]);

  useEffect(() => {
    if (currentMatch && messageRefs.current.has(currentMatch.messageId)) {
      const el = messageRefs.current.get(currentMatch.messageId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentMatch]);

  useEffect(() => {
    if (!searchOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  const handleSearchOpen = useCallback(() => {
    setSearchOpen(true);
    searchTimeoutRef.current = setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  const handleSearchPrev = useCallback(() => {
    setCurrentMatchIndex((prev) =>
      prev > 0 ? prev - 1 : Math.max(0, searchMatches.length - 1)
    );
  }, [searchMatches.length]);

  const handleSearchNext = useCallback(() => {
    setCurrentMatchIndex((prev) =>
      prev < searchMatches.length - 1 ? prev + 1 : 0
    );
  }, [searchMatches.length]);

  useEffect(() => {
    // Only auto-scroll if new messages were added (not on initial load or re-render)
    const isNewMessage = messages.length > lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;

    if (!isNewMessage || !bottomRef.current) return;

    // Only auto-scroll if user is near bottom or there's no user scroll position tracked
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      const viewport = scrollArea.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
      if (viewport) {
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        // Only scroll if user is within 150px of bottom (or hasn't scrolled yet)
        if (distanceFromBottom > 150) {
          return; // Don't auto-scroll - user is reading history
        }
      }
    }

    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Track scroll position to show/hide scroll to bottom button
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      // Show button if user has scrolled up significantly (more than 150px from bottom)
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const shouldShow = distanceFromBottom > 150 && messages.length > 0;
      setShowScrollToBottom(shouldShow);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    // Delay initial check to ensure DOM is ready
    const timeoutId = setTimeout(handleScroll, 100);

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, [messages.length]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowScrollToBottom(false);
  };

  useEffect(() => {
    if (!topRef.current || !onLoadMore || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(topRef.current);

    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  const handleEdit = (message: DeepAgentMessage) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const handleEditSave = (messageId: string) => {
    if (editContent.trim() && onEditMessage) {
      onEditMessage(messageId, editContent.trim());
    }
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleRegenerate = (messageId: string) => {
    if (onRegenerateMessage) {
      onRegenerateMessage(messageId);
    }
  };

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={cn("flex-1 flex flex-col min-h-0", className)}>
        <div className="flex items-center justify-center flex-1">
          <div className="text-center text-muted-foreground px-4">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium mb-1">No messages yet</p>
            <p className="text-xs sm:text-sm text-muted-foreground/70">
              Start by typing a message below or selecting a session from the sidebar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 flex flex-col min-h-0 overflow-hidden relative", className)}>
      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-1 sm:gap-2 border-b border-border px-2 sm:px-4 py-1.5 sm:py-2 bg-muted/30 flex-wrap">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) {
                  handleSearchPrev();
                } else {
                  handleSearchNext();
                }
              }
            }}
            placeholder="Search..."
            className="h-7 sm:h-8 text-xs sm:text-sm flex-1 min-w-[100px]"
          />
          {searchMatches.length > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
              {currentMatchIndex + 1} of {searchMatches.length}
            </span>
          )}
          {searchQuery && searchMatches.length === 0 && (
            <span className="text-xs text-muted-foreground">No matches</span>
          )}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleSearchPrev}
              disabled={searchMatches.length === 0}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleSearchNext}
              disabled={searchMatches.length === 0}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleSearchClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Search toggle button */}
      {!searchOpen && messages.length > 0 && (
        <div className="flex justify-end px-4 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={handleSearchOpen}
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            Search
          </Button>
        </div>
      )}

      <ScrollArea ref={scrollAreaRef} className="flex-1 h-0 relative overflow-hidden">
        <div className="space-y-4 p-4">
          {messages.map((message) => {
            const isSystem = message.role === "system";
            const isError = message.error || (message.content.toLowerCase().includes("error") && message.role === "assistant");
            const isFailedMessage = message.error && message.role === "assistant";
            const isCurrentSearchMatch = currentMatch?.messageId === message.id;

            return (
              <div
                key={message.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el);
                  else messageRefs.current.delete(message.id);
                }}
                className={cn(
                  "flex group",
                  getRoleAlignment(message.role),
                  isCurrentSearchMatch && "ring-2 ring-primary/50 rounded-lg"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] sm:max-w-[80%] md:max-w-[75%] rounded-lg px-3 sm:px-4 py-2 sm:py-3",
                    getRoleColor(message.role),
                    isSystem && "max-w-full text-center text-xs italic",
                    isError && "border border-destructive/30 bg-destructive/5"
                  )}
                >
                  {!isSystem && (
                    <div className={cn("flex items-center gap-2 mb-2 text-xs font-medium", message.role === "user" && "text-white/70 dark:text-black/70")}>
                      {getRoleIcon(message.role)}
                      <span className="capitalize">{message.role}</span>
                      <span className={cn(message.role === "user" ? "text-white/50 dark:text-black/50" : "text-muted-foreground/50")}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                      {message.error && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Error</Badge>
                      )}
                    </div>
                  )}

                  {isSystem && isError && (
                    <AlertCircle className="inline h-3.5 w-3.5 mr-1 text-destructive" />
                  )}

                  {message.content && (
                    <div className={cn(isSystem && "text-xs", message.role === "user" && "text-white dark:text-black")}>
                      {isSystem ? (
                        message.content
                      ) : (
                        <>
                          <div style={{fontSize: '10px', color: '#999', marginBottom: '4px'}}>
                            Content length: {message.content.length} chars
                          </div>
                          <DeepAgentMarkdownContent
                            content={message.content}
                            className={message.role === "user" ? "text-white dark:text-black [&_*]:text-white dark:[&_*]:text-black" : ""}
                          />
                        </>
                      )}
                    </div>
                  )}

                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.toolCalls.map((toolCall) => (
                        <div key={toolCall.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                toolCall.status === "completed"
                                  ? "default"
                                  : toolCall.status === "error"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className="text-[10px] h-5"
                            >
                              {toolCall.status}
                            </Badge>
                            {toolCall.duration !== undefined && (
                              <span className="text-[10px] text-muted-foreground">
                                {toolCall.duration < 1000
                                  ? `${toolCall.duration}ms`
                                  : `${(toolCall.duration / 1000).toFixed(1)}s`}
                              </span>
                            )}
                          </div>
                          <DeepAgentToolCallCard
                            tool={toolCall.name}
                            input={toolCall.input}
                            output={toolCall.output}
                            success={toolCall.status === "completed"}
                            duration={toolCall.duration}
                            isResult={toolCall.status === "completed" || toolCall.status === "error"}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {message.fileChanges && message.fileChanges.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.fileChanges.map((change) => (
                        <DeepAgentFileChangeCard key={change.path} change={change} />
                      ))}
                    </div>
                  )}

                  {message.structuredResponse && (
                    <div className="mt-3">
                      <DeepAgentStructuredOutput response={message.structuredResponse} />
                    </div>
                  )}

                  {/* Token usage display for assistant messages */}
                  {message.role === "assistant" && message.tokenUsage && !message.isStreaming && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <DeepAgentTokenDisplay tokenUsage={message.tokenUsage} />
                    </div>
                  )}

                  {/* Action buttons for user and assistant messages */}
                  {!isSystem && !message.isStreaming && editingMessageId !== message.id && (
                    <div className="mt-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {message.role === "user" && onEditMessage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 sm:h-6 w-6 p-0 min-w-[24px]"
                          onClick={() => handleEdit(message)}
                          title="Edit message"
                          aria-label="Edit message"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {message.role === "assistant" && onRegenerateMessage && !isFailedMessage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 sm:h-6 w-6 p-0 min-w-[24px]"
                          onClick={() => handleRegenerate(message.id)}
                          title="Regenerate response"
                          aria-label="Regenerate response"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                      {isFailedMessage && onRetryMessage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 sm:h-6 px-1.5 sm:px-2 text-destructive hover:text-destructive"
                          onClick={() => onRetryMessage(message.id)}
                          title="Retry message"
                          aria-label="Retry message"
                        >
                          <RotateCcw className="h-3 w-3 sm:mr-1" />
                          <span className="text-xs hidden sm:inline">Retry</span>
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Edit mode for user messages */}
                  {!isSystem && editingMessageId === message.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleEditSave(message.id);
                          }
                          if (e.key === "Escape") {
                            handleEditCancel();
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleEditSave(message.id)}
                        >
                          Save & Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={handleEditCancel}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Subagent cards */}
          {subagents.length > 0 && (
            <div className="space-y-2 pl-4 border-l-2 border-primary/10">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Subagents
              </span>
              {subagents.map((subagent) => (
                <DeepAgentSubagentCard key={subagent.id} subagent={subagent} />
              ))}
            </div>
          )}

          {isLoadingMore && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          <div ref={topRef} />
          <DeepAgentStreamingIndicator isStreaming={isStreaming ?? false} currentTool={currentTool} />
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Scroll to bottom button - outside ScrollArea to avoid overflow clipping */}
      {showScrollToBottom && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-4 right-4 shadow-md gap-1.5 z-10"
          onClick={scrollToBottom}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          <span>New messages</span>
        </Button>
      )}
    </div>
  );
}
