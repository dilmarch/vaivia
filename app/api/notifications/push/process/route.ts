import { NextResponse } from "next/server";
import { processNotificationEmailOutbox } from "@/lib/emailNotifications";
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
        const [pushResult, emailResult] = await Promise.allSettled([
            processNotificationPushOutbox(25),
            processNotificationEmailOutbox(25),
        ]);
        const pushResults =
            pushResult.status === "fulfilled" ? pushResult.value : [];
        const emailResults =
            emailResult.status === "fulfilled" ? emailResult.value : [];
        const errors = [
            pushResult.status === "rejected"
                ? {
                      channel: "push",
                      error:
                          pushResult.reason instanceof Error
                              ? pushResult.reason.message
                              : "Could not process push notifications.",
                  }
                : null,
            emailResult.status === "rejected"
                ? {
                      channel: "email",
                      error:
                          emailResult.reason instanceof Error
                              ? emailResult.reason.message
                              : "Could not process email notifications.",
                  }
                : null,
        ].filter(Boolean);

        return NextResponse.json({
            ok: errors.length === 0,
            processed: pushResults.length + emailResults.length,
            push: {
                processed: pushResults.length,
                results: pushResults,
            },
            email: {
                processed: emailResults.length,
                results: emailResults,
            },
            errors,
        });
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
