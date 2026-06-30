import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { runDiscovery } from "@/lib/pipeline/discovery";
import type { AgentEvent } from "@/components/admin/chat-message";

/**
 * POST /api/v1/admin/pipelines/stream
 *
 * Stream pipeline discovery events for a company.
 * Returns SSE events as discovery progresses through MCP servers.
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/pipelines/stream" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    let body: { companyName?: string; companyId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json", message: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const { companyName, companyId } = body;

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json(
        { error: "bad_request", message: "companyName is required" },
        { status: 400 }
      );
    }

    const sessionId = crypto.randomUUID();
    const userId = session.user.id;

    // Create discovery session record
    await prisma.pipelineDiscoverySession.create({
      data: {
        sessionId,
        userId,
        companyName,
        companyId: companyId || null,
        status: "running",
      },
    });

    log.info("pipelines.stream.session_created", {
      sessionId,
      companyName,
      companyId,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Handle client disconnect/abort to prevent orphaned streams
        const abortHandler = () => {
          try {
            controller.close();
          } catch {
            // Controller may already be closed, ignore error
          }
          log.info("pipelines.stream.aborted", { sessionId });
        };

        req.signal.addEventListener("abort", abortHandler);

        const send = (event: AgentEvent) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        // Helper to clean up abort listener
        const cleanup = () => {
          req.signal.removeEventListener("abort", abortHandler);
        };

        // Send session started event
        send({
          type: "session.started",
          sessionId,
          company: companyName,
        });

        // Send thinking message
        send({
          type: "agent.thinking",
          message: `Starting discovery for ${companyName}...`,
        });

        // Send progress
        send({
          type: "progress.update",
          stage: "Initializing MCP servers",
          percent: 5,
        });

        try {
          // Run discovery and capture events
          const result = await runDiscovery(companyName, companyId, sessionId);

          // Stream events from discovery result
          const totalEvents = result.eventLog.length;
          let processedEvents = 0;

          for (const event of result.eventLog) {
            processedEvents++;

            // Convert internal events to AgentEvent format
            if (event.type === "discovery.started") {
              send({
                type: "agent.thinking",
                message: `Querying MCP servers for ${companyName}...`,
              });
              send({
                type: "progress.update",
                stage: "Querying MCP servers",
                percent: 10,
              });
            }

            if (event.type === "tool.call_start") {
              send({
                type: "tool.call_start",
                tool: event.data.tool as string,
                args: { company: companyName },
              });
              send({
                type: "progress.update",
                stage: `Calling ${event.data.tool}`,
                percent: Math.min(10 + (processedEvents / totalEvents) * 50, 60),
              });
            }

            if (event.type === "tool.call_end") {
              send({
                type: "tool.call_end",
                tool: event.data.tool as string,
                result: { sources: event.data.sourceCount },
                duration: event.data.duration as number,
              });
            }

            if (event.type === "tool.error") {
              send({
                type: "tool.error",
                tool: event.data.tool as string,
                error: event.data.error as string,
              });
            }

            if (event.type === "source.discovered" || event.type === "discovery.sources_collected") {
              // Emit individual sources
              if (event.type === "discovery.sources_collected") {
                send({
                  type: "agent.thinking",
                  message: `Found ${event.data.count} sources. Verifying URLs...`,
                });
                send({
                  type: "progress.update",
                  stage: "Verifying sources",
                  percent: 65,
                });
              }
            }

            if (event.type === "source.verifying") {
              send({
                type: "agent.thinking",
                message: `Verifying ${event.data.url}...`,
              });
            }

            if (event.type === "source.verified") {
              const source = result.verifiedSources.find(
                (s) => s.url === event.data.url
              );
              if (source) {
                send({
                  type: "source.discovered",
                  source: {
                    url: source.url,
                    sourceType: source.sourceType,
                    label: source.label,
                    priority: source.priority,
                  },
                });
                send({
                  type: "source.verified",
                  url: source.url,
                  status: event.data.reachable ? "valid" : "invalid",
                  details: source.verificationDetails,
                });
              }
              // Update progress based on verified count
              const verifiedCount = result.verifiedSources.filter(
                (_, i) => i < processedEvents
              ).length;
              send({
                type: "progress.update",
                stage: "Verifying sources",
                percent: Math.min(65 + (verifiedCount / result.verifiedSources.length) * 20, 85),
              });
            }

            if (event.type === "discovery.gaps_identified") {
              const missing = (event.data.missing as string[]) || [];
              const recommendations = (event.data.recommendations as string[]) || [];
              send({
                type: "agent.decision",
                reasoning: `Gap analysis found ${missing.length} missing source types`,
                action: `Recommendations: ${recommendations.join(", ") || "none"}`,
              });
              send({
                type: "progress.update",
                stage: "Analyzing gaps",
                percent: 90,
              });
            }

            if (event.type === "discovery.completed") {
              send({
                type: "progress.update",
                stage: "Discovery complete",
                percent: 100,
              });
            }
          }

          // Save discovered sources to database
          const verifiedSources = result.verifiedSources.filter((s) => s.verified);
          if (verifiedSources.length > 0) {
            await prisma.discoveredSource.createMany({
              data: verifiedSources.map((source) => ({
                sessionId,
                url: source.url,
                sourceType: source.sourceType as never,
                label: source.label,
                priority: source.priority ?? 5,
                verified: source.verified,
                verificationDetails: source.verificationDetails,
              })),
            });
          }

          // Update session status
          await prisma.pipelineDiscoverySession.update({
            where: { sessionId },
            data: {
              status: "completed",
              completedAt: new Date(),
              eventLog: JSON.parse(JSON.stringify(result.eventLog)),
            },
          });

          // Send completion event
          send({
            type: "session.completed",
            sources: result.verifiedSources
              .filter((s) => s.verified)
              .map((s) => ({
                url: s.url,
                sourceType: s.sourceType,
                label: s.label,
                priority: s.priority,
              })),
            gaps: result.gaps,
          });

          log.info("pipelines.stream.completed", {
            sessionId,
            sourceCount: result.verifiedSources.length,
            verifiedCount: verifiedSources.length,
            gapsCount: result.gaps.length,
          });

          cleanup();
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          log.error("pipelines.stream.error", {
            sessionId,
            error: errorMessage,
          });

          // Update session as failed
          await prisma.pipelineDiscoverySession.update({
            where: { sessionId },
            data: {
              status: "failed",
              completedAt: new Date(),
              error: errorMessage,
            },
          });

          send({
            type: "session.error",
            error: errorMessage,
            recoverable: false,
          });

          cleanup();
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
    log.error("pipelines.stream.setup.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to start discovery stream" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;