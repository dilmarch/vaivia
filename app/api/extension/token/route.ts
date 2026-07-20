import { NextResponse } from "next/server";
import {
    authenticateBrowserExtensionRequest,
    exchangeBrowserExtensionAuthCode,
    getExtensionCorsHeaders,
} from "@/lib/browserExtension/auth";

export async function OPTIONS(request: Request) {
    return new NextResponse(null, {
        status: 204,
        headers: getExtensionCorsHeaders(request),
    });
}

export async function POST(request: Request) {
    const body = await request.json().catch(() => null);
    const extensionId = typeof body?.extensionId === "string" ? body.extensionId : "";
    const code = typeof body?.code === "string" ? body.code : "";
    const corsHeaders = getExtensionCorsHeaders(request, extensionId);
    const session = await exchangeBrowserExtensionAuthCode({ code, extensionId });

    if (!session) {
        return NextResponse.json(
            { error: "The extension connection code is invalid or expired." },
            { status: 401, headers: corsHeaders }
        );
    }

    return NextResponse.json(
        { accessToken: session.token, expiresAt: session.expiresAt },
        { headers: corsHeaders }
    );
}

export async function DELETE(request: Request) {
    const session = await authenticateBrowserExtensionRequest(request);
    const headers = getExtensionCorsHeaders(request, session?.extensionId);

    if (!session) {
        return NextResponse.json({ ok: true }, { headers });
    }

    const { error } = await session.service
        .from("browser_extension_sessions" as never)
        .update({ revoked_at: new Date().toISOString() } as never)
        .eq("id", session.sessionId);

    if (error) {
        return NextResponse.json(
            { error: "Could not disconnect this browser." },
            { status: 500, headers }
        );
    }

    return NextResponse.json({ ok: true }, { headers });
}
