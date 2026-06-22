"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, History, RefreshCw } from "lucide-react";

interface DebugSessionRecord {
  id: string;
  opencodeSessionId: string;
  problem: string;
  status: string;
  eventCount: number;
  startedAt: string;
  completedAt: string | null;
}

interface DebugSessionHistoryProps {
  onSelectSession: (sessionId: string, problem: string) => void;
  onResumeSession: (sessionId: string, problem: string) => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge className="bg-info">Running</Badge>;
    case "completed":
      return <Badge className="bg-success">Completed</Badge>;
    case "failed":
      return <Badge className="bg-destructive">Failed</Badge>;
    case "cancelled":
      return <Badge className="bg-muted">Cancelled</Badge>;
    default:
      return <Badge className="bg-muted">{status}</Badge>;
  }
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function truncateProblem(problem: string, maxLen = 50): string {
  if (problem.length <= maxLen) return problem;
  return problem.slice(0, maxLen) + "...";
}

export function DebugSessionHistory({
  onSelectSession,
  onResumeSession,
}: DebugSessionHistoryProps) {
  const [sessions, setSessions] = useState<DebugSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/admin/debug/sessions?limit=20");
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadSessions = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/admin/debug/sessions?limit=20");
        if (!res.ok) throw new Error("Failed to fetch sessions");
        const data = await res.json();
        if (mounted) setSessions(data.sessions);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadSessions();
    return () => { mounted = false; };
  }, []);

  const handleDelete = async (sessionId: string) => {
    if (!confirm("Delete this session record?")) return;
    try {
      const res = await fetch(`/api/v1/admin/debug/session/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete session");
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <History className="h-4 w-4" />
          <span>Loading session history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <History className="h-4 w-4" />
          <span>No debug sessions yet. Start a new debug session above.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Session History</h3>
          <Badge variant="secondary" className="text-xs">
            {sessions.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchSessions}
          className="h-8"
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Refresh
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Problem</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-20 text-center">Events</TableHead>
            <TableHead className="w-24">Duration</TableHead>
            <TableHead className="w-32">Started</TableHead>
            <TableHead className="w-20 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow
              key={session.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() =>
                onSelectSession(session.opencodeSessionId, session.problem)
              }
            >
              <TableCell className="font-medium text-sm">
                {truncateProblem(session.problem)}
              </TableCell>
              <TableCell>{getStatusBadge(session.status)}</TableCell>
              <TableCell className="text-center text-sm">
                {session.eventCount}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDuration(session.startedAt, session.completedAt)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(session.startedAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                {session.status !== "running" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResumeSession(
                        session.opencodeSessionId,
                        session.problem
                      );
                    }}
                  >
                    Resume
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(session.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
