"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Plus,
  MessageSquare,
  Trash2,
  Search,
  Edit2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentSession } from "@/lib/deepagent/types";

interface DeepAgentSessionSidebarProps {
  sessions: DeepAgentSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  className?: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge className="bg-info text-[10px] h-4 px-1.5">Running</Badge>;
    case "completed":
      return <Badge className="bg-success text-[10px] h-4 px-1.5">Done</Badge>;
    case "failed":
      return <Badge className="bg-destructive text-[10px] h-4 px-1.5">Failed</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{status}</Badge>;
  }
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function DeepAgentSessionSidebar({
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  className,
}: DeepAgentSessionSidebarProps) {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sessions, searchQuery]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!onDeleteSession) return;
    if (!confirm("Delete this session?")) return;
    setLoading(true);
    try {
      await onDeleteSession(sessionId);
    } finally {
      setLoading(false);
    }
  };

  const handleTitleClick = (session: DeepAgentSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const handleTitleSave = async (sessionId: string) => {
    if (editTitle.trim()) {
      try {
        await fetch(`/api/v1/admin/deepagent/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editTitle.trim() }),
        });
      } catch {
        // Silently fail - title update is non-critical
      }
    }
    setEditingSessionId(null);
    setEditTitle("");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === "Enter") {
      handleTitleSave(sessionId);
    } else if (e.key === "Escape") {
      setEditingSessionId(null);
      setEditTitle("");
    }
  };

  return (
    <div className={cn("flex flex-col h-full border-r border-border bg-card", className)}>
      <div className="p-3 sm:p-4 border-b border-border space-y-3">
        <Button onClick={onNewSession} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">New Chat</span>
        </Button>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 sm:h-9 text-xs sm:text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 h-0">
        <div className="p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {sessions.length === 0 ? "No sessions yet" : "No sessions match search"}
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "group w-full text-left rounded-lg px-2 sm:px-3 py-2 transition-colors hover:bg-accent cursor-pointer",
                  selectedSessionId === session.id && "bg-accent border border-border"
                )}
                onClick={() => onSelectSession(session.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSession(session.id);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 mb-1 flex-wrap">
                      {editingSessionId === session.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => handleTitleKeyDown(e, session.id)}
                            onBlur={() => handleTitleSave(session.id)}
                            className="h-6 text-xs flex-1 min-w-0"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTitleSave(session.id);
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span
                            className="text-sm font-medium truncate flex-1 min-w-0"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleTitleClick(session);
                            }}
                            title="Double-click to edit title"
                          >
                            {session.title || "Untitled"}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTitleClick(session);
                            }}
                            className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {getStatusBadge(session.status)}
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                      <span>{formatTime(session.updatedAt)}</span>
                      <span className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline">{session.messageCount} msgs</span>
                    </div>
                  </div>
                  {onDeleteSession && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => handleDelete(e, session.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
