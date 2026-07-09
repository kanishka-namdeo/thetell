/**
 * DeepAgent backend implementation
 *
 * Uses the deepagents library with:
 * - LocalShellBackend for filesystem tools and shell execution (restricted to PROJECT_ROOT)
 * - FilesystemPermission rules to enforce PROJECT_ROOT boundary
 * - ChatOpenAI model instance (no process.env mutation)
 * - Memory integration (AGENTS.md loaded at startup)
 * - Proper v3 streaming API with concurrent event projections
 * - Content-compat middleware for OpenAI-compatible APIs
 * - PostgresSaver for production durability (replaces MemorySaver)
 * - CompositeBackend for long-term memory persistence
 * - Runtime context for authorization
 * - Explicit subagents for heavy tasks
 *
 * Security model:
 * - LocalShellBackend provides filesystem + shell access
 * - FilesystemPermission rules restrict to PROJECT_ROOT only
 * - .env files are explicitly denied (credentials protection)
 * - Shell commands run with working directory = PROJECT_ROOT
 * - interruptOn requires human approval for write/edit operations
 */

import { logger } from "@/lib/logger";
import { ChatOpenAI } from "@langchain/openai";
import {
  createDeepAgent,
  CompositeBackend,
  LocalShellBackend,
  StoreBackend,
  type FilesystemPermission,
} from "deepagents";
import { createMiddleware, HumanMessage, AIMessage, SystemMessage, ToolMessage } from "langchain";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { initCheckpointer } from "./init";

// Normalize to forward slashes — deepagents requires POSIX paths internally
const PROJECT_ROOT = process.cwd().replace(/\\/g, "/");

// Runtime context schema for authorization
const contextSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "USER"]),
});

const systemPrompt = `You are DeepAgent, an AI assistant with access to The Tell codebase.
You can read, write, edit files and run shell commands within the project directory.

Your capabilities:
- Read files to understand the codebase (restricted to project directory)
- Write new files to create components, utilities, or features
- Edit existing files to fix bugs or add features
- Execute shell commands within the project directory
- Search for files and content using glob and grep
- Delegate complex tasks to subagents (code-editor for file changes, researcher for investigation)

IMPORTANT: You can only access files within the project directory. You cannot read or write
files outside this directory, including system files, user home directories, or other projects.

Always explain what you're doing and why. When making changes, be defensive and consider edge cases.
Follow the existing code patterns and conventions in the codebase.

When users share preferences or important context, save them to /memories/preferences.md
so you remember them in future conversations.

The Tell is an AI-powered corporate intelligence platform built with Next.js 16, TypeScript, Prisma, and PostgreSQL.
It analyzes public company signals (news, filings, transcripts, social media) to infer strategic intent.`;

/**
 * Middleware to fix OpenAI-compatible API content format issues.
 *
 * The deepagents library creates messages with Anthropic-style content blocks
 * (e.g. [{type: "text", text: "..."}]). Some OpenAI-compatible APIs reject
 * this format. This middleware flattens content arrays to plain strings.
 */
const openAIContentCompatMiddleware = createMiddleware({
  name: "OpenAIContentCompat",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapModelCall: async (request: any, handler: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function flattenContent(content: any): string {
      if (!Array.isArray(content)) return content;
      const parts: string[] = [];
      for (const block of content) {
        if (typeof block === "string") {
          parts.push(block);
        } else if (typeof block === "object" && block !== null) {
          if (typeof block.text === "string") parts.push(block.text);
          else if (typeof block.value === "string") parts.push(block.value);
          else if (typeof block.content === "string") parts.push(block.content);
        }
      }
      return parts.length > 0 ? parts.join("\n") : JSON.stringify(content);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function rebuildMessage(msg: any): any {
      if (!msg || !Array.isArray(msg.content)) return msg;
      const flat = flattenContent(msg.content);

      if (typeof msg.tool_calls !== "undefined") {
        return new AIMessage({ content: flat, tool_calls: msg.tool_calls });
      }
      if (typeof msg.tool_call_id !== "undefined") {
        return new ToolMessage({
          content: flat,
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        });
      }
      if (msg.constructor?.name === "SystemMessage" || msg._getType?.() === "system") {
        return new SystemMessage({ content: flat });
      }
      return new HumanMessage({ content: flat });
    }

    if (request.messages) {
      request.messages = request.messages.map(rebuildMessage);
    }
    if (request.systemMessage) {
      if (Array.isArray(request.systemMessage)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        request.systemMessage = request.systemMessage.map((msg: any) => rebuildMessage(msg));
      } else if (Array.isArray(request.systemMessage.content)) {
        request.systemMessage = rebuildMessage(request.systemMessage);
      }
    }

    return handler(request);
  },
});

/**
 * Build and configure a DeepAgent instance.
 *
 * Implements production best practices:
 * - PostgresSaver for durable state persistence
 * - thread_id in configurable for checkpointer
 * - Runtime context for authorization
 * - CompositeBackend for long-term memory
 * - Explicit subagents for heavy tasks
 * - Durability mode "async" for performance
 */
async function buildAgent() {
  const baseModel = process.env.DEEPAGENT_MODEL || process.env.FAST_MODEL;
  if (!baseModel) {
    throw new Error("DEEPAGENT_MODEL or FAST_MODEL must be configured");
  }

  const apiKey = process.env.API_KEY ?? process.env.OPENAI_API_KEY;
  const baseURL = process.env.BASE_URL ?? process.env.OPENAI_BASE_URL;

  if (!apiKey || !baseURL) {
    throw new Error("API_KEY and BASE_URL must be configured");
  }

  const model = new ChatOpenAI({
    model: baseModel,
    apiKey,
    configuration: {
      baseURL,
    },
    timeout: 120_000,
  });

  // Initialize checkpointer for production durability
  const checkpointer = await initCheckpointer();

  // CompositeBackend: filesystem access + long-term memory
  // LocalShellBackend provides filesystem tools and shell execution
  // restricted to PROJECT_ROOT via permissions
  const backend = new CompositeBackend(
    new LocalShellBackend({
      rootDir: PROJECT_ROOT,
      virtualMode: true, // Normalize paths to rootDir
    }),
    {
      "/memories/": new StoreBackend(), // Cross-thread persistence
    }
  );

  // Filesystem permissions: restrict all operations to PROJECT_ROOT
  // This prevents access to files outside the codebase
  // Note: deepagents permissions use absolute directory paths, not glob patterns
  const permissions: FilesystemPermission[] = [
    // Allow read/write within project root
    {
      operations: ["read", "write"],
      paths: [PROJECT_ROOT],
      mode: "allow",
    },
    // Deny access to sensitive files within project (credentials, secrets)
    {
      operations: ["read", "write"],
      paths: [
        `${PROJECT_ROOT}/.env`,
        `${PROJECT_ROOT}/.env.local`,
      ],
      mode: "deny",
    },
    // Deny everything outside project root
    {
      operations: ["read", "write"],
      paths: ["/"],
      mode: "deny",
    },
  ];

  // Long-term memory store
  const store = new InMemoryStore();

  // Explicit subagents for heavy tasks
  const subagents = [
    {
      name: "code-editor",
      description: "Handles file editing and code generation",
      systemPrompt: `You are a code editor.
IMPORTANT: Return concise summaries (under 200 words).
Do NOT include full file contents in your response.
Focus on the changes made and any important notes.`,
      tools: [], // Uses built-in filesystem tools
    },
    {
      name: "researcher",
      description: "Conducts research by searching files and web",
      systemPrompt: `You are a research assistant.
Return essential findings only (under 500 words).
Use grep and read_file to find relevant information.
Synthesize findings into actionable insights.`,
      tools: [], // Uses built-in tools
    },
  ];

  return createDeepAgent({
    model,
    backend,
    systemPrompt,
    memory: [`${PROJECT_ROOT}/AGENTS.md`],
    skills: [`${PROJECT_ROOT}/.cursor/skills/`],
    permissions,
    interruptOn: {
      write_file: true,
      edit_file: true,
    },
    checkpointer,
    contextSchema,
    store,
    subagents,
    middleware: [openAIContentCompatMiddleware],
    // Note: LocalShellBackend provides filesystem + shell access
    // Note: permissions restrict to PROJECT_ROOT only
    // Note: No LangSmith tracing - observability is local (Pino logging + Prisma audit)
  });
}

/** Stream event types yielded by streamDeepAgent */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown; status: string }
  | { type: "tool_result"; id: string; name: string; output: string; success: boolean; duration?: number }
  | { type: "file_write" | "file_edit"; path: string }
  | { type: "task_update"; task: { id: string; content: string; status: "pending" | "in_progress" | "completed"; createdAt: string; updatedAt: string } }
  | { type: "subagent_start"; id: string; name: string }
  | { type: "subagent_text"; subagentId: string; text: string }
  | { type: "subagent_tool_call"; subagentId: string; id: string; name: string; input: unknown; status: string }
  | { type: "subagent_tool_result"; subagentId: string; id: string; name: string; output: string; success: boolean; duration?: number }
  | { type: "subagent_complete"; id: string; name: string; status: "completed" | "failed" }
  | { type: "compression"; compressionType: "summarization" | "offloading"; trigger: string; tokensSaved: number; filePath?: string }
  | { type: "structured_response"; schemaId: string; schemaName: string; data: Record<string, unknown> }
  | { type: "error"; error: string };

/**
 * Merge multiple async iterables into a single async generator.
 * Events are yielded in the order they arrive from any source.
 */
async function* mergeAsyncIterables<T>(
  iterables: AsyncIterable<T>[]
): AsyncGenerator<T> {
  const queue: T[] = [];
  let resolve: (() => void) | null = null;
  let activeSources = iterables.length;

  const drainSource = async (source: AsyncIterable<T>) => {
    try {
      for await (const item of source) {
        queue.push(item);
        if (resolve) {
          const r = resolve;
          resolve = null;
          r();
        }
      }
    } catch {
      // Source completed or errored — decrement and signal
    } finally {
      activeSources--;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r();
      }
    }
  };

  // Start all sources concurrently (don't await)
  const sourcePromises = iterables.map((src) => drainSource(src));

  try {
    while (activeSources > 0 || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<void>((r) => { resolve = r; });
      }
    }
  } finally {
    // Ensure all source promises settle to avoid unhandled rejections
    await Promise.allSettled(sourcePromises);
  }
}

/**
 * Stream events from DeepAgent using the v3 streaming API.
 *
 * Uses concurrent projections (messages, toolCalls, subagents) merged
 * into a single event stream for real-time SSE delivery.
 *
 * Production best practices:
 * - thread_id in configurable for checkpointer persistence
 * - durability: "async" for crash recovery during execution
 * - context for runtime authorization
 */
export async function* streamDeepAgent(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  context?: { userId: string; role: "ADMIN" | "USER" },
  structuredSchema?: {
    id: string;
    name: string;
    fields: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
    }>;
  } | null
): AsyncGenerator<StreamEvent> {
  try {
    const agent = await buildAgent();

    logger.info("deepagent.stream.starting", {
      sessionId,
      messageCount: messages.length,
      hasStructuredSchema: !!structuredSchema,
    });

    // Build system prompt with structured output instructions if schema provided
    let systemPromptAddition = "";
    if (structuredSchema) {
      const fieldDescriptions = structuredSchema.fields
        .map(
          (f) =>
            `- ${f.name} (${f.type}${f.required ? ", required" : ""}): ${f.description}`
        )
        .join("\n");

      systemPromptAddition = `\n\nIMPORTANT: You must respond with a structured JSON object matching this schema:\nSchema name: ${structuredSchema.name}\nFields:\n${fieldDescriptions}\n\nRespond ONLY with valid JSON matching this schema. Do not include any other text.`;
    }

    // Append to system message if structured schema provided
    const messagesWithSchema = systemPromptAddition
      ? [
          ...messages,
          { role: "system", content: systemPromptAddition },
        ]
      : messages;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run: any = await agent.streamEvents(
      { messages: messagesWithSchema },
      {
        version: "v3",
        configurable: { thread_id: sessionId },
        durability: "async",
        context: context ?? { userId: "anonymous", role: "ADMIN" },
      }
    );

    // Build three async iterables from the v3 projections
    const textStream: AsyncIterable<StreamEvent> = (async function* () {
      for await (const msg of run.messages) {
        for await (const token of msg.text) {
          yield { type: "text" as const, text: token };
        }
      }
    })();

    const toolStream: AsyncIterable<StreamEvent> = (async function* () {
      for await (const call of run.toolCalls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const callId = (call as any).id || crypto.randomUUID();

        yield {
          type: "tool_call" as const,
          id: callId,
          name: call.name,
          input: call.input,
          status: "running",
        };

        const output = await call.output;
        const callStatus = String(await call.status);
        const isExplicitError =
          callStatus === "error" || callStatus === "failed" || callStatus === "timeout";

        yield {
          type: "tool_result" as const,
          id: callId,
          name: call.name,
          output: typeof output === "string" ? output : JSON.stringify(output),
          success: !isExplicitError,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          duration: (call as any).duration,
        };

        // Track file changes from write/edit operations
        if (call.name === "write_file" || call.name === "edit_file") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const filePath = (call.input as any)?.path || (call.input as any)?.file_path;
          if (filePath) {
            yield {
              type: (call.name === "write_file" ? "file_write" : "file_edit") as "file_write" | "file_edit",
              path: filePath,
            };
          }
        }
      }
    })();

    const subagentStream: AsyncIterable<StreamEvent> = (async function* () {
      for await (const subagent of run.subagents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subagentId = (subagent as any).id || crypto.randomUUID();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (subagent as any).name || "unknown";
        
        yield { type: "subagent_start" as const, id: subagentId, name };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const msg of (subagent as any).messages) {
          for await (const token of msg.text) {
            yield { type: "subagent_text" as const, subagentId, text: token };
          }
        }
        
        yield { type: "subagent_complete" as const, id: subagentId, name, status: "completed" };
      }
    })();

    yield* mergeAsyncIterables([textStream, toolStream, subagentStream]);

    logger.info("deepagent.stream.completed", { sessionId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("deepagent.stream.error", { sessionId, error: errorMessage });
    yield { type: "error", error: errorMessage };
  }
}

/**
 * Create a DeepAgent instance for testing purposes.
 */
export async function createDeepAgentInstance() {
  return await buildAgent();
}
