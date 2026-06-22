"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Download,
  FileJson,
  FileText,
} from "lucide-react";
import type { DebugEvent } from "@/lib/debug/event-types";
import {
  exportSessionAsMarkdown,
  exportSessionAsJson,
  copyTranscriptToClipboard,
} from "@/lib/debug/session-export";

interface DebugToolbarProps {
  events: DebugEvent[];
  sessionId?: string | null;
  problem?: string;
  context?: string | null;
  status?: string;
  startedAt?: string;
  completedAt?: string | null;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DebugToolbar({
  events,
  sessionId,
  problem,
  context,
  status,
  startedAt,
  completedAt,
}: DebugToolbarProps) {
  const [copied, setCopied] = useState(false);

  const sessionData = useMemo(() => ({
    id: sessionId || "unknown",
    problem: problem || "Debug Session",
    context: context || null,
    status: status || "unknown",
    eventCount: events.length,
    startedAt: startedAt || new Date().toISOString(),
    completedAt: completedAt || null,
  }), [sessionId, problem, context, status, events.length, startedAt, completedAt]);

  const handleCopyTranscript = useCallback(async () => {
    if (events.length === 0) return;
    try {
      await copyTranscriptToClipboard(events);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = events
        .map((e) => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.type}: ${e.content || e.tool || ""}`)
        .join("\n");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [events]);

  const handleExportMarkdown = useCallback(() => {
    if (events.length === 0) return;
    const md = exportSessionAsMarkdown(sessionData, events);
    const ts = new Date().toISOString().slice(0, 10);
    downloadFile(md, `debug-session-${ts}.md`, "text/markdown");
  }, [events, sessionData]);

  const handleExportJson = useCallback(() => {
    if (events.length === 0) return;
    const json = exportSessionAsJson(sessionData, events);
    const ts = new Date().toISOString().slice(0, 10);
    downloadFile(json, `debug-session-${ts}.json`, "application/json");
  }, [events, sessionData]);

  if (events.length === 0) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={handleExportMarkdown}
      >
        <FileText className="h-3.5 w-3.5" />
        <span>Markdown</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={handleExportJson}
      >
        <FileJson className="h-3.5 w-3.5" />
        <span>JSON</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={handleCopyTranscript}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-success" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>Copy</span>
          </>
        )}
      </Button>
      <Download className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
