import { NextResponse } from "next/server";
import {
    createBrowserExtensionAuthCode,
    isSameOriginRequest,
    normalizeExtensionState,
    parseExtensionRedirectUri,
} from "@/lib/browserExtension/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
    if (!isSameOriginRequest(request)) {
        return NextResponse.json({ error: "Invalid authorization request." }, { status: 403 });
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
    const redirectTarget = parseExtensionRedirectUri(formData.get("redirect_uri"));
    const state = normalizeExtensionState(formData.get("state"));

    if (!redirectTarget || !state) {
        return NextResponse.json({ error: "Invalid extension callback." }, { status: 400 });
    }

    const { code } = await createBrowserExtensionAuthCode({
        userId: user.id,
        extensionId: redirectTarget.extensionId,
        redirectUri: redirectTarget.redirectUri,
    });
    const callback = new URL(redirectTarget.redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);

    return NextResponse.redirect(callback, 303);
}
