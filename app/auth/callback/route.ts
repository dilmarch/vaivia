import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getUserProfileDefaults,
  mergeProfileWithAuthDefaults,
} from "@/lib/userProfileDefaults";
import { normalizeAuthConfirmNext } from "@/lib/authConfirmRedirect";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeAuthConfirmNext(requestUrl.searchParams.get("next"), requestUrl.origin);
  const redirectTo = new URL(next, requestUrl.origin);

  if (!code) {
    const loginUrl = new URL("/auth/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "Google sign-in did not return an auth code.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/auth/login", requestUrl.origin);
    loginUrl.searchParams.set(
      "error",
      error.message || "Google sign-in could not be completed.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.warn("Google sign-in completed, but user profile could not be read:", {
      message: userError.message,
    });
  }

  if (user) {
    const defaults = getUserProfileDefaults(user);
    const { data: existingProfile, error: profileReadError } = await supabase
      .from("user_profiles")
      .select("id,first_name,last_name,username,email,avatar_url,join_date")
      .eq("id", user.id)
      .maybeSingle();

    if (profileReadError) {
      console.warn("Could not load user profile after Google sign-in:", {
        message: profileReadError.message,
        code: profileReadError.code,
        details: profileReadError.details,
        userId: user.id,
      });
    }

    const profilePayload = {
      ...mergeProfileWithAuthDefaults(existingProfile, defaults),
      updated_at: new Date().toISOString(),
    };

    const { error: profileUpsertError } = await supabase
      .from("user_profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profileUpsertError) {
      console.warn("Could not seed user profile after Google sign-in:", {
        message: profileUpsertError.message,
        code: profileUpsertError.code,
        details: profileUpsertError.details,
        payload: profilePayload,
      });
    }
  }

  return NextResponse.redirect(redirectTo);
}
