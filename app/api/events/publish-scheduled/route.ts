import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const expected =
    process.env.EVENTS_MAINTENANCE_SECRET || process.env.CRON_SECRET;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || bearer !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("events")
    .update({ status: "published", published_at: now })
    .eq("status", "scheduled")
    .lte("publish_at", now)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: "Scheduled events could not be published." },
      { status: 500 },
    );
  }
  return NextResponse.json({ published: data?.length || 0 });
}
