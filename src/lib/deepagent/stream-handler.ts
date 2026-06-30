/**
 * DeepAgent stream handler - simplified SSE formatting
 *
 * The backend now yields typed StreamEvent objects directly from the
 * deepagents v3 streaming API, so we no longer need extraction functions.
 * This module just provides SSE formatting utilities.
 */

import type { DeepAgentToolCall, DeepAgentFileChange, DeepAgentApproval } from "./types";

export interface SSEEvent {
  event: string;
  data: unknown;
}

export function createSSEFormatter() {
  return function formatSSE(event: SSEEvent): string {
    const lines = [`event: ${event.event}`, `data: ${JSON.stringify(event.data)}`, "", ""];
    return lines.join("\n");
  };
}

// Legacy exports for backward compatibility (no longer used in the new flow)
export function extractToolCallsFromChunk(_chunk: unknown): DeepAgentToolCall[] {
  return [];
}

export function extractToolCallsFromText(_text: string): {
  toolCalls: DeepAgentToolCall[];
  cleanedText: string;
} {
  return { toolCalls: [], cleanedText: "" };
}

export function extractFileChangesFromChunk(_chunk: unknown): DeepAgentFileChange[] {
  return [];
}

export function extractTextFromChunk(_chunk: unknown): string {
  return "";
}

export function extractApprovalFromChunk(_chunk: unknown): DeepAgentApproval | null {
  return null;
}
