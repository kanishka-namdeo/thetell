/**
 * LangGraph SDK client wrapper for remote agent connections
 * 
 * Supports both local execution and managed LangGraph Platform deployments.
 * Provides a unified interface compatible with useStream patterns.
 */

import { logger } from "@/lib/logger";

export interface DeepAgentClientConfig {
  /** Deployment mode: local (in-process) or managed (remote LangGraph Platform) */
  mode: "local" | "managed";
  /** Remote agent URL for managed deployments */
  remoteUrl?: string;
  /** LangSmith API key for managed deployments */
  langsmithApiKey?: string;
  /** LangSmith project name for tracing */
  langsmithProject?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface StreamEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface RunConfig {
  threadId: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: Record<string, any>;
}

/**
 * DeepAgent client that abstracts local vs managed execution
 */
export class DeepAgentClient {
  private config: DeepAgentClientConfig;

  constructor(config: DeepAgentClientConfig) {
    this.config = config;
  }

  /**
   * Stream events from the agent
   */
  async *stream(config: RunConfig): AsyncGenerator<StreamEvent> {
    if (this.config.mode === "managed") {
      yield* this.streamManaged(config);
    } else {
      yield* this.streamLocal(config);
    }
  }

  /**
   * Stream from managed LangGraph Platform deployment
   */
  private async *streamManaged(config: RunConfig): AsyncGenerator<StreamEvent> {
    const { remoteUrl, langsmithApiKey, timeout = 300000 } = this.config;

    if (!remoteUrl) {
      throw new Error("remoteUrl is required for managed mode");
    }

    if (!langsmithApiKey) {
      throw new Error("langsmithApiKey is required for managed mode");
    }

    logger.info("deepagent.client.stream_managed", {
      remoteUrl,
      threadId: config.threadId,
    });

    const response = await fetch(`${remoteUrl}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": langsmithApiKey,
      },
      body: JSON.stringify({
        thread_id: config.threadId,
        input: { messages: [{ role: "user", content: config.message }] },
        config: {
          configurable: {
            thread_id: config.threadId,
            ...config.context,
          },
        },
        stream_mode: "messages",
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Managed agent error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body from managed agent");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              yield this.mapManagedEvent(parsed);
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stream from local agent execution
   */
  private async *streamLocal(config: RunConfig): AsyncGenerator<StreamEvent> {
    // Import dynamically to avoid circular dependencies
    const { streamDeepAgent } = await import("./backend");

    const messages = [{ role: "user", content: config.message }];
    const context = config.context || { userId: "anonymous", role: "ADMIN" as const };

    for await (const event of streamDeepAgent(config.threadId, messages, context as { userId: string; role: "USER" | "ADMIN" })) {
      yield event;
    }
  }

  /**
   * Map managed LangGraph events to our StreamEvent format
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapManagedEvent(event: any): StreamEvent {
    // LangGraph Platform sends events in a specific format
    // Map them to our internal StreamEvent structure
    if (event.event === "on_chat_model_stream") {
      return {
        type: "text",
        text: event.data?.chunk?.content || "",
      };
    }

    if (event.event === "on_tool_start") {
      return {
        type: "tool_call",
        id: event.run_id,
        name: event.name,
        input: event.data?.input,
        status: "running",
      };
    }

    if (event.event === "on_tool_end") {
      return {
        type: "tool_result",
        id: event.run_id,
        name: event.name,
        output: typeof event.data?.output === "string" 
          ? event.data.output 
          : JSON.stringify(event.data?.output),
        success: true,
      };
    }

    // Default passthrough
    return {
      type: event.event || "unknown",
      ...event.data,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): DeepAgentClientConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DeepAgentClientConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create a DeepAgent client from environment configuration
 */
export function createDeepAgentClient(): DeepAgentClient {
  const mode = process.env.DEEPAGENT_MODE || "local";
  if (mode !== "local" && mode !== "managed") {
    throw new Error(`DEEPAGENT_MODE must be "local" or "managed", got "${mode}"`);
  }
  
  return new DeepAgentClient({
    mode,
    remoteUrl: process.env.LANGGRAPH_REMOTE_URL,
    langsmithApiKey: process.env.LANGSMITH_API_KEY,
    langsmithProject: process.env.LANGSMITH_PROJECT || "the-tell",
    timeout: parseInt(process.env.DEEPAGENT_TIMEOUT || "300000", 10),
  });
}

/**
 * Singleton client instance
 */
let clientInstance: DeepAgentClient | null = null;

export function getDeepAgentClient(): DeepAgentClient {
  if (!clientInstance) {
    clientInstance = createDeepAgentClient();
  }
  return clientInstance;
}
