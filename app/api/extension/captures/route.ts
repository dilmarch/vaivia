import { NextResponse } from "next/server";
import {
    authenticateBrowserExtensionRequest,
    getExtensionCorsHeaders,
} from "@/lib/browserExtension/auth";
import {
    getAccessibleTrip,
    saveBrowserExtensionCapture,
} from "@/lib/browserExtension/captures";
import type { BrowserExtensionCaptureRequest } from "@/lib/browserExtension/contracts";

export async function OPTIONS(request: Request) {
    return new NextResponse(null, {
        status: 204,
        headers: getExtensionCorsHeaders(request),
    });
}

export async function POST(request: Request) {
    const session = await authenticateBrowserExtensionRequest(request);
    const headers = getExtensionCorsHeaders(request, session?.extensionId);

    if (!session) {
        return NextResponse.json(
            { error: "Connect the extension to VAIVIA again." },
            { status: 401, headers }
        );
    }

    const body = (await request.json().catch(() => null)) as
        | BrowserExtensionCaptureRequest
        | null;
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const capture = body?.capture;

    if (!tripId || !capture || (capture.type !== "hotel" && capture.type !== "flight")) {
        return NextResponse.json(
            { error: "A valid trip and travel capture are required." },
            { status: 400, headers }
        );
    }

    const trip = await getAccessibleTrip(session.service, session.userId, tripId);
    if (!trip) {
        return NextResponse.json(
            { error: "You do not have access to that trip." },
            { status: 403, headers }
        );
    }

    try {
        const result = await saveBrowserExtensionCapture({
            service: session.service,
            userId: session.userId,
            trip,
            capture,
        });
        return NextResponse.json(result, { headers });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not add this travel item to VAIVIA.",
            },
            { status: 400, headers }
        );
    }
}
