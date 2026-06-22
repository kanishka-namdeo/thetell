import type { DebugEvent } from "./event-types";

interface SessionExportData {
  id: string;
  problem: string;
  context?: string | null;
  status: string;
  eventCount: number;
  startedAt: string | Date;
  completedAt?: string | Date | null;
}

export function exportSessionAsMarkdown(
  session: SessionExportData,
  events: DebugEvent[]
): string {
  const lines: string[] = [];
  const startedAt =
    typeof session.startedAt === "string"
      ? session.startedAt
      : session.startedAt.toISOString();

  lines.push(`# Debug Session`);
  lines.push("");
  lines.push(`**Status:** ${session.status}`);
  lines.push(`**Started:** ${new Date(startedAt).toLocaleString()}`);
  if (session.completedAt) {
    const completedAt =
      typeof session.completedAt === "string"
        ? session.completedAt
        : session.completedAt.toISOString();
    lines.push(`**Completed:** ${new Date(completedAt).toLocaleString()}`);
  }
  lines.push(`**Events:** ${session.eventCount}`);
  lines.push("");
  lines.push(`## Problem`);
  lines.push("");
  lines.push(session.problem);
  lines.push("");

  if (session.context) {
    lines.push(`## Context`);
    lines.push("");
    lines.push(session.context);
    lines.push("");
  }

  lines.push(`## Conversation`);
  lines.push("");

  for (const event of events) {
    const ts = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "text":
        lines.push(`### [${ts}] Agent`);
        lines.push("");
        lines.push(event.content || "");
        lines.push("");
        break;
      case "tool_use":
        lines.push(
          `### [${ts}] Tool Call: \`${event.tool || "unknown"}\``
        );
        lines.push("");
        if (event.tool_input) {
          lines.push("```json");
          lines.push(JSON.stringify(event.tool_input, null, 2));
          lines.push("```");
          lines.push("");
        }
        break;
      case "tool_result":
        lines.push(
          `### [${ts}] Tool Result: \`${event.tool || "unknown"}\` ${event.success ? "✓" : "✗"}`
        );
        lines.push("");
        if (event.tool_output) {
          const output =
            typeof event.tool_output === "string"
              ? event.tool_output
              : JSON.stringify(event.tool_output, null, 2);
          lines.push("```");
          lines.push(output);
          lines.push("```");
          lines.push("");
        }
        break;
      case "error":
        lines.push(`### [${ts}] Error`);
        lines.push("");
        lines.push(`> ${event.content || "Unknown error"}`);
        lines.push("");
        break;
      case "system":
        lines.push(`### [${ts}] System`);
        lines.push("");
        lines.push(`*${event.content || ""}*`);
        lines.push("");
        break;
      default:
        break;
    }
  }

  return lines.join("\n");
}

export function exportSessionAsJson(
  session: SessionExportData,
  events: DebugEvent[]
): string {
  return JSON.stringify({ session, events }, null, 2);
}

export function formatTranscript(events: DebugEvent[]): string {
  const lines: string[] = [];

  for (const event of events) {
    const ts = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "text":
        lines.push(`[${ts}] Agent: ${event.content || ""}`);
        break;
      case "tool_use":
        lines.push(`[${ts}] Tool: ${event.tool || "unknown"}`);
        break;
      case "tool_result":
        lines.push(
          `[${ts}] Result (${event.success ? "OK" : "FAIL"}): ${event.tool || "unknown"}`
        );
        break;
      case "error":
        lines.push(`[${ts}] ERROR: ${event.content || ""}`);
        break;
      case "system":
        lines.push(`[${ts}] SYSTEM: ${event.content || ""}`);
        break;
      default:
        break;
    }
  }

  return lines.join("\n");
}

export async function copyTranscriptToClipboard(
  events: DebugEvent[]
): Promise<void> {
  const text = formatTranscript(events);
  await navigator.clipboard.writeText(text);
}
