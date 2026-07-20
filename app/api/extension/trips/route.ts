import { NextResponse } from "next/server";
import {
    authenticateBrowserExtensionRequest,
    getExtensionCorsHeaders,
} from "@/lib/browserExtension/auth";
import { getBrowserExtensionTrips } from "@/lib/browserExtension/captures";

export async function OPTIONS(request: Request) {
    return new NextResponse(null, {
        status: 204,
        headers: getExtensionCorsHeaders(request),
    });
}

export async function GET(request: Request) {
    const session = await authenticateBrowserExtensionRequest(request);
    const headers = getExtensionCorsHeaders(request, session?.extensionId);

    if (!session) {
        return NextResponse.json(
            { error: "Connect the extension to VAIVIA again." },
            { status: 401, headers }
        );
    }

    const trips = await getBrowserExtensionTrips(session.service, session.userId);
    return NextResponse.json({ trips }, { headers });
}
