import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { inngest } from "@/lib/inngest/client";
import { z } from "zod";

const VALID_EVENTS = [
  "signal/discovery.requested",
  "signal/analysis.requested",
  "company/enrichment.requested",
  "batch/discovery.requested",
  "source/health.check",
  "correlation/manual.trigger",
  "hypothesis/generate",
  "calibration/run",
] as const;

const TriggerJobSchema = z.object({
  type: z.enum(VALID_EVENTS),
  payload: z.record(z.string(), z.unknown()),
});

export async function GET() {
  const session = await auth();
  if (!requireAdmin(session)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Inngest manages jobs natively via its dashboard and API.
  // This endpoint now redirects to the Inngest dev server UI.
  return NextResponse.json({
    message: "Jobs are managed by Inngest. Visit the Inngest dev server UI for job status and history.",
    inngestDevServer: process.env.INNGEST_DEV_SERVER_URL || "http://localhost:8288",
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!requireAdmin(session)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const parsed = TriggerJobSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Invalid event type or payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, payload } = parsed.data;

  // Send event to Inngest
  await inngest.send({
    name: type,
    data: payload,
  });

  return NextResponse.json({ message: "Event sent to Inngest", type, payload }, { status: 201 });
}
