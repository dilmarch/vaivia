import { NextResponse } from "next/server";
import { processNotificationQueues } from "@/lib/notificationQueueProcessor";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Could not verify admin queue processor access:", {
            message: profileError.message,
            code: profileError.code,
            details: profileError.details,
            hint: profileError.hint,
        });
        return NextResponse.json(
            { error: "Could not verify admin access." },
            { status: 500 }
        );
    }

    if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const result = await processNotificationQueues(25);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Could not manually process notification queues:", error);
        return NextResponse.json(
            {
                ok: false,
                error: "Could not process notification queues.",
            },
            { status: 500 }
        );
    }
}
