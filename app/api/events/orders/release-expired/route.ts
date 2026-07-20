import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

function authorized(request: NextRequest) {
  const expected =
    process.env.EVENTS_MAINTENANCE_SECRET || process.env.CRON_SECRET;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && bearer === expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const service = createServiceRoleClient();
  const { data: orders, error } = await service
    .from("event_orders")
    .select("id")
    .eq("status", "pending")
    .lt("hold_expires_at", new Date().toISOString())
    .limit(100);
  if (error)
    return NextResponse.json(
      { error: "Maintenance query failed." },
      { status: 500 },
    );
  let released = 0;
  for (const order of orders || []) {
    const { data } = await service.rpc("release_event_order_hold", {
      target_order_id: order.id,
      release_status: "expired",
    });
    if (data) released += 1;
  }
  return NextResponse.json({ released });
}
