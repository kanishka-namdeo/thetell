"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentMessage, DeepAgentSession } from "@/lib/deepagent/types";

interface DeepAgentExportProps {
  session: DeepAgentSession | null;
  messages: DeepAgentMessage[];
  className?: string;
}

export function DeepAgentExport({ session, messages, className }: DeepAgentExportProps) {
  const exportToMarkdown = () => {
    if (!session) return;

    const lines: string[] = [];
    lines.push(`# ${session.title}`);
    lines.push("");
    lines.push(`**Session ID:** ${session.id}`);
    lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
    lines.push(`**Status:** ${session.status}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    messages.forEach((message) => {
      const timestamp = new Date(message.timestamp).toLocaleString();
      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      
      lines.push(`## ${role} - ${timestamp}`);
      lines.push("");
      
      if (message.content) {
        lines.push(message.content);
        lines.push("");
      }

      if (message.toolCalls && message.toolCalls.length > 0) {
        lines.push("### Tool Calls");
        lines.push("");
        message.toolCalls.forEach((toolCall) => {
          lines.push(`- **${toolCall.name}** (${toolCall.status})`);
          if (toolCall.input) {
            lines.push(`  - Input: \`${JSON.stringify(toolCall.input)}\``);
          }
          if (toolCall.output) {
            lines.push(`  - Output: ${toolCall.output}`);
          }
          if (toolCall.duration !== undefined) {
            lines.push(`  - Duration: ${toolCall.duration}ms`);
          }
        });
        lines.push("");
      }

      if (message.fileChanges && message.fileChanges.length > 0) {
        lines.push("### File Changes");
        lines.push("");
        message.fileChanges.forEach((change) => {
          lines.push(`- **${change.path}** (${change.type})`);
          if (change.additions !== undefined) {
            lines.push(`  - Additions: ${change.additions}`);
          }
          if (change.deletions !== undefined) {
            lines.push(`  - Deletions: ${change.deletions}`);
          }
        });
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });

    const markdown = lines.join("\n");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deepagent-${session.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    if (!session) return;

    const data = {
      session,
      messages,
      exportedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deepagent-${session.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={exportToMarkdown}
        disabled={messages.length === 0}
        title="Export as Markdown"
        className="h-8"
      >
        <Download className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">MD</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={exportToJSON}
        disabled={messages.length === 0}
        title="Export as JSON"
        className="h-8"
      >
        <Download className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">JSON</span>
      </Button>
    </div>
  );
}
