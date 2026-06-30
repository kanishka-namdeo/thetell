/**
 * DeepAgent chat types - adapted from debug chat-types for DeepAgent interface
 */

export type DeepAgentRole = "user" | "assistant" | "system" | "tool";

export type DeepAgentToolCallStatus = "pending" | "running" | "completed" | "error";

export type DeepAgentFileChangeType = "created" | "modified" | "deleted";

export type DeepAgentFileAttachmentType = "image" | "pdf" | "text";

export interface DeepAgentFileAttachment {
  id: string;
  name: string;
  type: DeepAgentFileAttachmentType;
  mimeType: string;
  size: number;
  /** Base64-encoded content for images, raw text for text files */
  data: string;
  /** Preview URL for images (object URL or data URL) */
  previewUrl?: string;
}

export interface DeepAgentToolCall {
  id: string;
  name: string;
  input?: unknown;
  output?: string;
  status: DeepAgentToolCallStatus;
  duration?: number;
}

export interface DeepAgentFileChange {
  path: string;
  type: DeepAgentFileChangeType;
  additions?: number;
  deletions?: number;
  diff?: string;
}

export type DeepAgentApprovalStatus = "pending" | "approved" | "rejected" | "timeout";

export interface DeepAgentApproval {
  id: string;
  toolName: string;
  toolInput: unknown;
  status: DeepAgentApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface DeepAgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

export interface DeepAgentMessage {
  id: string;
  role: DeepAgentRole;
  content: string;
  timestamp: string;
  toolCalls?: DeepAgentToolCall[];
  fileChanges?: DeepAgentFileChange[];
  approvals?: DeepAgentApproval[];
  tokenUsage?: DeepAgentTokenUsage;
  structuredResponse?: DeepAgentStructuredResponse;
  tasks?: DeepAgentTaskEvent[];
  subagents?: DeepAgentSubagentEvent[];
  compressionEvents?: DeepAgentCompressionEvent[];
  isStreaming?: boolean;
  error?: boolean;
}

export interface DeepAgentSession {
  id: string;
  title: string;
  status: "idle" | "running" | "completed" | "failed";
  model?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export function createDeepAgentStreamingMessage(id: string): DeepAgentMessage {
  return {
    id,
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString(),
    isStreaming: true,
    toolCalls: [],
    fileChanges: [],
  };
}

// Task/Planning event types for write_todos visualization
export type DeepAgentTaskStatus = "pending" | "in_progress" | "completed";

export interface DeepAgentTaskEvent {
  id: string;
  content: string;
  status: DeepAgentTaskStatus;
  createdAt: string;
  updatedAt: string;
}

// Subagent event types for nested subagent stream visualization
export type DeepAgentSubagentStatus = "started" | "running" | "completed" | "failed";

export interface DeepAgentSubagentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface DeepAgentSubagentEvent {
  id: string;
  name: string;
  status: DeepAgentSubagentStatus;
  parentToolCallId?: string;
  messages: DeepAgentSubagentMessage[];
  toolCalls: DeepAgentToolCall[];
}

// Context compression event types
export type DeepAgentCompressionType = "summarization" | "offloading";

export interface DeepAgentCompressionEvent {
  type: DeepAgentCompressionType;
  trigger: string;
  tokensSaved: number;
  timestamp: string;
  filePath?: string;
}

// Structured output schema types
export type DeepAgentSchemaFieldType = "string" | "number" | "boolean" | "object" | "array";

export interface DeepAgentSchemaField {
  name: string;
  type: DeepAgentSchemaFieldType;
  description: string;
  required: boolean;
}

export interface DeepAgentStructuredSchema {
  id: string;
  name: string;
  description: string;
  fields: DeepAgentSchemaField[];
}

export interface DeepAgentStructuredResponse {
  schemaId: string;
  schemaName: string;
  data: Record<string, unknown>;
  timestamp: string;
}
