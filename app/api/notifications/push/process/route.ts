import { NextResponse } from "next/server";
import { processNotificationPushOutbox } from "@/lib/pushNotifications";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
    const secret =
        process.env.VAIVIA_PUSH_PROCESS_SECRET || process.env.CRON_SECRET || "";

    if (!secret && process.env.NODE_ENV !== "production") return true;
    if (!secret) return false;

    const authorization = request.headers.get("authorization") || "";
    const headerSecret = request.headers.get("x-vaivia-push-secret") || "";

    return authorization === `Bearer ${secret}` || headerSecret === secret;
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const results = await processNotificationPushOutbox(25);
        return NextResponse.json({ ok: true, processed: results.length, results });
    } catch (error) {
        console.error("Could not process push notification outbox:", error);
        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not process push notifications.",
            },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    return GET(request);
}
