import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
    params: Promise<{ tripId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { tripId } = await context.params;
    const body = await request.json().catch(() => null);
    const scenarios = Array.isArray(body?.scenarios) ? body.scenarios : null;

    if (!scenarios) {
        return NextResponse.json(
            { error: "Journey planning scenarios must be an array." },
            { status: 400 }
        );
    }

    const { error } = await supabase
        .from("trip_journey_planning_states" as any)
        .upsert(
            {
                trip_id: tripId,
                scenarios,
                updated_by: user.id,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "trip_id" }
        );

    if (error) {
        console.error("Could not save journey planning state:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            userId: user.id,
        });

        return NextResponse.json(
            { error: "Could not save journey planning." },
            { status: 500 }
        );
    }

    return NextResponse.json({ ok: true });
}
