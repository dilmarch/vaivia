import { NextResponse } from "next/server";
import { processNotificationQueues } from "@/lib/notificationQueueProcessor";

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
        const result = await processNotificationQueues(25);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Could not process notification outboxes:", error);
        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not process notifications.",
            },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    return GET(request);
}
