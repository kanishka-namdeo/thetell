export type DebugEventType =
  | "text"
  | "tool_use"
  | "tool_result"
  | "error"
  | "system"
  | "unknown";

export interface DebugEvent {
  type: DebugEventType;
  content?: string;
  tool?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  timestamp: string;
  duration?: number;
  success?: boolean;
}

export type BackendStatus = "connected" | "disconnected" | "checking";

export type SessionStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StreamStatus = "connected" | "disconnected" | "reconnecting";

export interface DebugSessionState {
  sessionId: string | null;
  events: DebugEvent[];
  isRunning: boolean;
  error: string | null;
  backendStatus: BackendStatus;
  activeSessions: number;
  streamStatus: StreamStatus;
}

export const INITIAL_SESSION_STATE: DebugSessionState = {
  sessionId: null,
  events: [],
  isRunning: false,
  error: null,
  backendStatus: "checking",
  activeSessions: 0,
  streamStatus: "disconnected",
};
