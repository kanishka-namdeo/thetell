import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPendingAlertsForUser, markAlertsAsRead } from "@/lib/alerts/signal-alerts";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "alerts-api" });

/**
 * GET /api/v1/alerts
 * Fetch pending alerts for the current user's watched companies
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const alerts = await getPendingAlertsForUser(session.user.id);

    return NextResponse.json({ alerts });
  } catch (error) {
    log.error("alerts_fetch_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/alerts
 * Mark alerts as read
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { alertIds } = body;

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return NextResponse.json(
        { error: "alertIds must be a non-empty array" },
        { status: 400 }
      );
    }

    await markAlertsAsRead(alertIds, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("alerts_mark_read_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return NextResponse.json(
      { error: "Failed to mark alerts as read" },
      { status: 500 }
    );
  }
}
