/**
 * DeepAgent Profiles API
 *
 * Manages harness profiles for model-specific tuning.
 *
 * GET  - List available profiles or get a specific profile
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { listProfiles, getProfile } from "@/lib/deepagent/profiles";

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("id");

    if (profileId) {
      const profile = getProfile(profileId);
      log.info("deepagent.profiles.get", { profileId });
      return NextResponse.json({ data: profile });
    }

    const profiles = listProfiles();
    log.info("deepagent.profiles.list", { count: profiles.length });
    return NextResponse.json({ data: profiles });
  } catch (error) {
    log.error("deepagent.profiles.get.error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
