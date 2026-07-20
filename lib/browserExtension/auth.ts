import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const TOKEN_PREFIX = "vaivia_ext_";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 180;
const AUTH_CODE_DURATION_MS = 1000 * 60 * 5;

type ExtensionAuthCodeRow = {
    id: string;
    user_id: string;
    extension_id: string;
    redirect_uri: string;
    expires_at: string;
    used_at: string | null;
};

type ExtensionSessionRow = {
    id: string;
    user_id: string;
    extension_id: string;
    expires_at: string;
    revoked_at: string | null;
};

function hashSecret(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function getAllowedExtensionIds() {
    return new Set(
        String(process.env.VAIVIA_BROWSER_EXTENSION_IDS || "")
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter((value) => EXTENSION_ID_PATTERN.test(value))
    );
}

export function parseExtensionRedirectUri(value: unknown) {
    if (typeof value !== "string" || value.length > 500) return null;

    try {
        const url = new URL(value);
        const extensionId = url.hostname.split(".")[0]?.toLowerCase() || "";
        const allowedIds = getAllowedExtensionIds();

        if (
            url.protocol !== "https:" ||
            url.hostname !== `${extensionId}.chromiumapp.org` ||
            !EXTENSION_ID_PATTERN.test(extensionId) ||
            !/^\/vaivia\/?$/.test(url.pathname) ||
            url.search ||
            url.hash ||
            (allowedIds.size > 0 && !allowedIds.has(extensionId))
        ) {
            return null;
        }

        return { extensionId, redirectUri: url.toString() };
    } catch {
        return null;
    }
}

export function normalizeExtensionState(value: unknown) {
    if (typeof value !== "string") return null;
    const state = value.trim();
    return /^[A-Za-z0-9_-]{16,200}$/.test(state) ? state : null;
}

export async function createBrowserExtensionAuthCode({
    userId,
    extensionId,
    redirectUri,
}: {
    userId: string;
    extensionId: string;
    redirectUri: string;
}) {
    const code = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + AUTH_CODE_DURATION_MS).toISOString();
    const service = createServiceRoleClient();
    const { error } = await service
        .from("browser_extension_auth_codes" as never)
        .insert({
            user_id: userId,
            code_hash: hashSecret(code),
            extension_id: extensionId,
            redirect_uri: redirectUri,
            expires_at: expiresAt,
        } as never);

    if (error) throw new Error(`Could not create extension authorization code: ${error.message}`);
    return { code, expiresAt };
}

export async function exchangeBrowserExtensionAuthCode({
    code,
    extensionId,
}: {
    code: string;
    extensionId: string;
}) {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(code) || !EXTENSION_ID_PATTERN.test(extensionId)) {
        return null;
    }

    const service = createServiceRoleClient();
    const now = new Date().toISOString();
    const { data, error } = await service
        .from("browser_extension_auth_codes" as never)
        .select("id,user_id,extension_id,redirect_uri,expires_at,used_at")
        .eq("code_hash", hashSecret(code))
        .eq("extension_id", extensionId)
        .is("used_at", null)
        .gt("expires_at", now)
        .maybeSingle();

    if (error || !data) return null;
    const authCode = data as unknown as ExtensionAuthCodeRow;
    const { data: claimed, error: claimError } = await service
        .from("browser_extension_auth_codes" as never)
        .update({ used_at: now } as never)
        .eq("id", authCode.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();

    if (claimError || !claimed) return null;

    const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    const { error: sessionError } = await service
        .from("browser_extension_sessions" as never)
        .insert({
            user_id: authCode.user_id,
            token_hash: hashSecret(token),
            extension_id: authCode.extension_id,
            expires_at: expiresAt,
        } as never);

    if (sessionError) return null;
    return { token, expiresAt, userId: authCode.user_id };
}

export async function authenticateBrowserExtensionRequest(request: Request) {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";

    if (!token.startsWith(TOKEN_PREFIX) || token.length > 120) return null;

    const service = createServiceRoleClient();
    const now = new Date().toISOString();
    const { data, error } = await service
        .from("browser_extension_sessions" as never)
        .select("id,user_id,extension_id,expires_at,revoked_at")
        .eq("token_hash", hashSecret(token))
        .is("revoked_at", null)
        .gt("expires_at", now)
        .maybeSingle();

    if (error || !data) return null;
    const session = data as unknown as ExtensionSessionRow;

    void service
        .from("browser_extension_sessions" as never)
        .update({ last_used_at: now } as never)
        .eq("id", session.id);

    return {
        sessionId: session.id,
        userId: session.user_id,
        extensionId: session.extension_id,
        service,
    };
}

export function getExtensionCorsHeaders(request: Request, expectedExtensionId?: string) {
    const origin = request.headers.get("origin") || "";
    const match = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
    const extensionId = match?.[1] || "";
    const allowedOrigin =
        extensionId && (!expectedExtensionId || extensionId === expectedExtensionId)
            ? origin
            : "null";

    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "DELETE, GET, POST, OPTIONS",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
    };
}

export function isSameOriginRequest(request: Request) {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");

    if (origin) return origin === requestUrl.origin;
    if (!referer) return false;

    try {
        return new URL(referer).origin === requestUrl.origin;
    } catch {
        return false;
    }
}
