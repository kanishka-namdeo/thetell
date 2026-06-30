import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { streamDeepAgent } from "@/lib/deepagent/backend";

// Type declarations for global state used by event buffer management
declare global {
  var __lastBufferCleanup: number;
  var __bufferTimestamps: Map<string, number>;
}

// In-memory event buffer for reconnect/replay (per session)
const eventBuffers = new Map<string, Array<{ seq: number; event: string; data: unknown }>>();
const MAX_BUFFER_SIZE = 1000;
const BUFFER_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL for event buffers

// Periodic cleanup of stale event buffers (runs on each request)
function cleanupStaleBuffers() {
  // Track last cleanup time to avoid running too frequently
  const now = Date.now();
  if (typeof globalThis.__lastBufferCleanup === "undefined") {
    globalThis.__lastBufferCleanup = 0;
  }
  
  // Only cleanup every 5 minutes
  if (now - globalThis.__lastBufferCleanup < 5 * 60 * 1000) {
    return;
  }
  globalThis.__lastBufferCleanup = now;
  
  // Clean buffers that have exceeded TTL
  // Note: We track buffer creation time via a separate map
  if (typeof globalThis.__bufferTimestamps === "undefined") {
    globalThis.__bufferTimestamps = new Map<string, number>();
  }
  
  const timestamps = globalThis.__bufferTimestamps as Map<string, number>;
  for (const [sessionId, timestamp] of timestamps.entries()) {
    if (now - timestamp > BUFFER_TTL_MS) {
      eventBuffers.delete(sessionId);
      timestamps.delete(sessionId);
    }
  }
}

// Track buffer creation time
function trackBufferCreation(sessionId: string) {
  if (typeof globalThis.__bufferTimestamps === "undefined") {
    globalThis.__bufferTimestamps = new Map<string, number>();
  }
  (globalThis.__bufferTimestamps as Map<string, number>).set(sessionId, Date.now());
}

// Clean up buffer when stream completes/errors
function removeBuffer(sessionId: string) {
  eventBuffers.delete(sessionId);
  if (typeof globalThis.__bufferTimestamps !== "undefined") {
    (globalThis.__bufferTimestamps as Map<string, number>).delete(sessionId);
  }
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  // Cleanup stale event buffers periodically
  cleanupStaleBuffers();

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const message = searchParams.get("message");
    const since = searchParams.get("since"); // For reconnect/replay
    const responseFormat = searchParams.get("response_format"); // For structured output

    if (!sessionId || !message) {
      return new NextResponse("Missing sessionId or message", { status: 400 });
    }

    // Parse response_format if provided
    let structuredSchema = null;
    if (responseFormat) {
      try {
        structuredSchema = JSON.parse(responseFormat);
        log.info("deepagent.stream.structured_output", { sessionId, schema: structuredSchema.name });
      } catch {
        return new NextResponse("Invalid response_format JSON", { status: 400 });
      }
    }

    const userId = session.user.id;

    // If since parameter is provided, replay events from buffer
    if (since) {
      const sinceSeq = parseInt(since, 10);
      const buffer = eventBuffers.get(sessionId) || [];
      const eventsToReplay = buffer.filter((e) => e.seq > sinceSeq);

      if (eventsToReplay.length > 0) {
        log.info("deepagent.stream.replaying", { sessionId, sinceSeq, eventCount: eventsToReplay.length });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            for (const evt of eventsToReplay) {
              controller.enqueue(
                encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`)
              );
            }
            controller.close();
          },
        });

        return new NextResponse(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
    }

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { timestamp: "asc" },
          take: 50,
        },
      },
    });

    if (!deepAgentSession) {
      return new NextResponse("Session not found", { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Save user message
    await prisma.deepAgentMessage.create({
      data: {
        sessionId,
        role: "user",
        content: message,
      },
    });

    // Create assistant message placeholder
    const assistantMessage = await prisma.deepAgentMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: "",
        isStreaming: true,
      },
    });

    // Update session status
    await prisma.deepAgentSession.update({
      where: { id: sessionId },
      data: { status: "running" },
    });

    // Build message history
    const messages = [
      ...deepAgentSession.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const encoder = new TextEncoder();
    let seqCounter = 0;

    // Initialize event buffer for this session
    eventBuffers.set(sessionId, []);
    trackBufferCreation(sessionId);

    const stream = new ReadableStream({
      async start(controller) {
        // Handle client disconnect/abort to prevent orphaned event buffers
        const abortHandler = () => {
          removeBuffer(sessionId);
          try {
            controller.close();
          } catch {
            // Controller may already be closed, ignore error
          }
          log.info("deepagent.stream.aborted", { sessionId });
        };

        req.signal.addEventListener("abort", abortHandler);

        const send = (event: string, data: unknown) => {
          seqCounter++;
          const eventId = `${sessionId}-${seqCounter}`;
          const eventData = { ...data as object, _seq: seqCounter, _eventId: eventId };

          // Buffer event for potential replay
          const buffer = eventBuffers.get(sessionId);
          if (buffer) {
            buffer.push({ seq: seqCounter, event, data: eventData });
            if (buffer.length > MAX_BUFFER_SIZE) {
              buffer.shift(); // Remove oldest
            }
          }

          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`)
          );
        };

        send("connected", { sessionId, messageId: assistantMessage.id });

        try {
          let accumulatedContent = "";
          const toolCalls: unknown[] = [];
          const fileChanges: unknown[] = [];
          const totalTokenUsage = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedTokens: 0,
          };

          // Pass runtime context for authorization
          const context = {
            userId: session.user.id,
            role: session.user.role || "ADMIN",
          };

          for await (const event of streamDeepAgent(sessionId, messages, context, structuredSchema)) {
            if (event.type === "error") {
              log.error("deepagent.stream.error", { error: event.error });

              await prisma.deepAgentMessage.update({
                where: { id: assistantMessage.id },
                data: {
                  content: `Error: ${event.error}`,
                  isStreaming: false,
                },
              });

              await prisma.deepAgentSession.update({
                where: { id: sessionId },
                data: { status: "failed" },
              });

              send("error", { error: event.error });
              controller.close();
              return;
            }

            if (event.type === "text") {
              accumulatedContent += event.text;
              send("text", { text: event.text });
            }

            if (event.type === "tool_call") {
              toolCalls.push(event);
              send("tool_call", { toolCalls: [event] });
            }

            if (event.type === "tool_result") {
              // Update existing tool call with result
              const idx = toolCalls.findIndex(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tc: any) => tc.id === event.id
              );
              if (idx >= 0) {
                toolCalls[idx] = { ...(toolCalls[idx] as object), ...event };
              }
              send("tool_result", event);
            }

            if (event.type === "file_write" || event.type === "file_edit") {
              fileChanges.push({
                path: event.path,
                type: event.type === "file_write" ? "created" : "modified",
              });
              send("file_change", {
                fileChanges: [{ path: event.path, type: event.type === "file_write" ? "created" : "modified" }],
              });
            }

            // Handle structured response
            if (event.type === "structured_response") {
              send("structured_response", {
                schemaId: event.schemaId,
                schemaName: event.schemaName,
                data: event.data,
              });
            }

            // Forward task_update events for planning visualization
            if (event.type === "task_update") {
              send("task_update", {
                task: event.task,
              });
            }

            // Forward subagent events for nested stream visualization
            if (event.type === "subagent_start") {
              send("subagent_start", {
                id: event.id,
                name: event.name,
              });
            }

            if (event.type === "subagent_text") {
              send("subagent_text", {
                subagentId: event.subagentId,
                text: event.text,
              });
            }

            if (event.type === "subagent_tool_call") {
              send("subagent_tool_call", {
                subagentId: event.subagentId,
                id: event.id,
                name: event.name,
                input: event.input,
                status: event.status,
              });
            }

            if (event.type === "subagent_tool_result") {
              send("subagent_tool_result", {
                subagentId: event.subagentId,
                id: event.id,
                name: event.name,
                output: event.output,
                success: event.success,
                duration: event.duration,
              });
            }

            if (event.type === "subagent_complete") {
              send("subagent_complete", {
                id: event.id,
                name: event.name,
                status: event.status,
              });
            }

            // Forward compression events for context management UI
            if (event.type === "compression") {
              send("compression", {
                compressionType: event.compressionType,
                trigger: event.trigger,
                tokensSaved: event.tokensSaved,
                filePath: event.filePath,
              });
            }

            // Capture token usage if present
            if ("tokenUsage" in event && event.tokenUsage) {
              const usage = event.tokenUsage as typeof totalTokenUsage;
              totalTokenUsage.inputTokens += usage.inputTokens;
              totalTokenUsage.outputTokens += usage.outputTokens;
              totalTokenUsage.totalTokens += usage.totalTokens;
              totalTokenUsage.cachedTokens += usage.cachedTokens || 0;
            }
          }

          // Parse structured response if schema was provided
          let structuredResponse = null;
          if (structuredSchema && accumulatedContent.trim()) {
            try {
              const jsonMatch = accumulatedContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                                accumulatedContent.match(/\{[\s\S]*\}/);
              const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : accumulatedContent;
              const parsed = JSON.parse(jsonStr.trim());
              structuredResponse = {
                schemaId: structuredSchema.id,
                schemaName: structuredSchema.name,
                data: parsed,
              };
              send("structured_response", structuredResponse);
              log.info("deepagent.stream.structured_parsed", {
                sessionId,
                schemaId: structuredSchema.id,
              });
            } catch (parseError) {
              log.warn("deepagent.stream.structured_parse_failed", {
                sessionId,
                error: String(parseError),
                contentPreview: accumulatedContent.substring(0, 200),
              });
            }
          }

          log.info("deepagent.stream.completed", { accumulatedLength: accumulatedContent.length });

          await prisma.deepAgentMessage.update({
            where: { id: assistantMessage.id },
            data: {
              content: accumulatedContent,
              toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
              fileChanges: fileChanges.length > 0 ? JSON.parse(JSON.stringify(fileChanges)) : undefined,
              tokenUsage: totalTokenUsage.totalTokens > 0 ? totalTokenUsage : undefined,
              isStreaming: false,
            },
          });

          await prisma.deepAgentSession.update({
            where: { id: sessionId },
            data: { status: "completed" },
          });

          send("done", { messageId: assistantMessage.id, content: accumulatedContent });
          // Clean up event buffer and abort listener after successful completion
          removeBuffer(sessionId);
          req.signal.removeEventListener("abort", abortHandler);
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error("deepagent.stream.error", { error: errorMessage });

          await prisma.deepAgentMessage.update({
            where: { id: assistantMessage.id },
            data: {
              content: `Error: ${errorMessage}`,
              isStreaming: false,
            },
          });

          await prisma.deepAgentSession.update({
            where: { id: sessionId },
            data: { status: "failed" },
          });

          send("error", { error: errorMessage });
          // Clean up event buffer and abort listener after error
          removeBuffer(sessionId);
          req.signal.removeEventListener("abort", abortHandler);
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    log.error("deepagent.stream.setup.error", { error: String(error) });
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
