import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

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

    let adminSupabase: ReturnType<typeof createServiceRoleClient>;

    try {
        adminSupabase = createServiceRoleClient();
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Supabase service role client is not configured.";

        return NextResponse.json({ error: message }, { status: 500 });
    }

    const recipientEmail = user.email?.trim();

    if (!recipientEmail) {
        return NextResponse.json(
            { error: "Your authenticated admin account does not have an email address." },
            { status: 400 }
        );
    }

    const { data, error } = await adminSupabase
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
            {
                error: "Could not create test notification.",
                details: error.message,
                code: error.code,
            },
            { status: 500 }
        );
    }

    const { data: outbox, error: outboxError } = await adminSupabase
        .from("notification_email_outbox")
        .upsert({
            notification_id: data.id,
            user_id: user.id,
            notification_type: "terms_updated",
            recipient_email: recipientEmail,
            subject: "Test email notification",
            template_key: "terms_updated",
            payload: {
                notificationId: data.id,
                type: "terms_updated",
                title: "Test email notification",
                body: "This is a VAIVIA transactional email test generated from the admin-only email test endpoint.",
                metadata: { url: "/notifications", source: "email_test" },
                actorUserId: user.id,
                createdAt: new Date().toISOString(),
            },
        }, {
            onConflict: "notification_id",
        })
        .select("id,status")
        .single();

    if (outboxError) {
        console.error("Could not queue test email notification:", {
            notificationId: data.id,
            message: outboxError.message,
            code: outboxError.code,
            details: outboxError.details,
            hint: outboxError.hint,
        });
        return NextResponse.json(
            {
                error: "Test notification was created, but the email could not be queued.",
                notificationId: data.id,
                details: outboxError.message,
                code: outboxError.code,
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        ok: true,
        notificationId: data.id,
        outboxId: outbox.id,
        message: "Test notification created and email queued for the cron processor.",
    });
}
