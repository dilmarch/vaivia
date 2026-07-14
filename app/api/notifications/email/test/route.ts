import { NextResponse } from "next/server";
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

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
        .from("notifications")
        .insert({
            user_id: user.id,
            type: "terms_updated",
            title: "Test email notification",
            body: "This is a VAIVIA transactional email test generated from the admin-only email test endpoint.",
            metadata: { url: "/notifications", source: "email_test" },
        })
        .select("id")
        .single();

    if (error) {
        console.error("Could not create test email notification:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return NextResponse.json(
            { error: "Could not create test notification." },
            { status: 500 }
        );
    }

    return NextResponse.json({
        ok: true,
        notificationId: data.id,
        message:
            "Test notification created. An email will queue only if Email is enabled for Terms updates.",
    });
}
