import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  rateLimitPerMinute: z.number().min(1).max(1000).optional(),
  retryAttempts: z.number().min(0).max(10).optional(),
  timeout: z.number().min(5).max(300).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const requestId = crypto.randomUUID();
  const { name } = await params;
  const log = logger.child({ requestId, route: `PATCH /api/v1/admin/scrapers/${name}` });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const update = UpdateSchema.parse(body);

    log.info("admin.scraper.update.start", { name, update });

    // TODO: Persist scraper configuration to SystemConfig table
    return NextResponse.json(
      { error: "not_implemented", message: "Scraper configuration persistence not yet implemented" },
      { status: 501 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid configuration",
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.error("admin.scraper.update.error", { error: String(error), name });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update scraper" },
      { status: 500 }
    );
  }
}
