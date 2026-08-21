import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

const DEFAULT_ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function getAllowedOrigins() {
  const configuredOrigins = (process.env.MOBILE_API_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);
}

function getRequestOrigin(request: Request) {
  return request.headers.get("origin")?.trim() || null;
}

export function isAllowedMobileOrigin(request: Request) {
  const origin = getRequestOrigin(request);
  return !origin || getAllowedOrigins().has(origin);
}

export function getMobileCorsHeaders(
  request: Request,
  allowedMethods = "GET, OPTIONS",
) {
  const origin = getRequestOrigin(request);
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": allowedMethods,
    "Cache-Control": "private, no-store",
    Vary: "Origin",
  });

  if (origin && getAllowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function mobileJson(
  request: Request,
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = getMobileCorsHeaders(request);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  return Response.json(body, { ...init, headers });
}

export function mobileOptions(request: Request, allowedMethods?: string) {
  if (!isAllowedMobileOrigin(request)) {
    return mobileJson(request, { error: "Origin not allowed" }, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: getMobileCorsHeaders(request, allowedMethods),
  });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type MobileRequestContext = {
  accessToken: string;
  user: User;
  supabase: SupabaseClient<Database>;
};

export async function authenticateMobileRequest(
  request: Request,
): Promise<MobileRequestContext | Response> {
  if (!isAllowedMobileOrigin(request)) {
    return mobileJson(request, { error: "Origin not allowed" }, { status: 403 });
  }

  const accessToken = getBearerToken(request);
  console.info("[VAIVIA mobile API auth] request", {
    requestUrl: request.url,
    accessTokenExists: Boolean(accessToken),
  });
  if (!accessToken) {
    return mobileJson(request, { error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    console.error("Mobile API is missing browser-safe Supabase configuration.");
    return mobileJson(request, { error: "Service unavailable" }, { status: 503 });
  }

  const supabase = createClient<Database>(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  console.info("[VAIVIA mobile API auth] validation", {
    requestUrl: request.url,
    sessionExists: Boolean(user),
    accessTokenExists: Boolean(accessToken),
    authenticatedUserId: user?.id || null,
  });

  if (error || !user) {
    return mobileJson(request, { error: "Unauthorized" }, { status: 401 });
  }

  return { accessToken, user, supabase };
}
