import { createClient } from "@/lib/supabase/server";
import {
  getUserProfileDefaults,
  mergeProfileWithAuthDefaults,
} from "@/lib/userProfileDefaults";
import {
  getAlreadyConfirmedAuthRedirect,
  getMissingTokenAuthenticatedRedirect,
  normalizeAuthConfirmNext,
} from "@/lib/authConfirmRedirect";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

function redirectAuthError(message: string): never {
  redirect(`/auth/error?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = normalizeAuthConfirmNext(searchParams.get("next"), requestUrl.origin);
  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.warn("Email sign-up confirmed, but user profile could not be read:", {
          message: userError.message,
        });
      }

      if (user) {
        const defaults = getUserProfileDefaults(user);
        const metadata = user.user_metadata || {};
        const now = new Date().toISOString();
        const termsAcceptedAt =
          typeof metadata.terms_accepted_at === "string"
            ? metadata.terms_accepted_at
            : now;
        const marketingConsent =
          metadata.marketing_emails_consent === true ||
          metadata.marketing_emails_consent === "true";
        const marketingConsentedAt =
          typeof metadata.marketing_emails_consented_at === "string"
            ? metadata.marketing_emails_consented_at
            : marketingConsent
              ? termsAcceptedAt
              : null;
        const marketingConsentDecidedAt =
          typeof metadata.marketing_emails_consent_decided_at === "string"
            ? metadata.marketing_emails_consent_decided_at
            : termsAcceptedAt;

        const { data: existingProfile, error: profileReadError } = await supabase
          .from("user_profiles")
          .select(
            "id,first_name,last_name,username,email,avatar_url,join_date,terms_accepted_at,marketing_emails_consent,marketing_emails_consented_at,marketing_emails_consent_decided_at,onboarding_completed_at"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (profileReadError) {
          console.warn("Could not load user profile after email confirmation:", {
            message: profileReadError.message,
            code: profileReadError.code,
            details: profileReadError.details,
            userId: user.id,
          });
        }

        const profilePayload = {
          ...mergeProfileWithAuthDefaults(existingProfile, defaults),
          terms_accepted_at:
            existingProfile?.terms_accepted_at ?? termsAcceptedAt,
          marketing_emails_consent:
            existingProfile?.marketing_emails_consent ?? marketingConsent,
          marketing_emails_consented_at:
            existingProfile?.marketing_emails_consented_at ??
            marketingConsentedAt,
          marketing_emails_consent_decided_at:
            existingProfile?.marketing_emails_consent_decided_at ??
            marketingConsentDecidedAt,
          onboarding_completed_at:
            existingProfile?.onboarding_completed_at ?? now,
          updated_at: now,
        };

        const { error: profileUpsertError } = await supabase
          .from("user_profiles")
          .upsert(profilePayload, { onConflict: "id" });

        if (profileUpsertError) {
          console.warn("Could not seed user profile after email confirmation:", {
            message: profileUpsertError.message,
            code: profileUpsertError.code,
            details: profileUpsertError.details,
            userId: user.id,
          });
        }

        const { error: termsError } = await supabase.rpc("accept_current_terms");

        if (termsError) {
          console.warn("Could not record terms acceptance after email confirmation:", {
            message: termsError.message,
            code: termsError.code,
            details: termsError.details,
            userId: user.id,
          });
        }
      }

      // redirect user to specified redirect URL or root of app
      redirect(next);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const alreadyConfirmedRedirect = getAlreadyConfirmedAuthRedirect({
        error,
        user,
      });

      if (alreadyConfirmedRedirect) {
        redirect(alreadyConfirmedRedirect);
      }

      // redirect the user to an error page with some instructions
      redirectAuthError(error?.message || "Email confirmation could not be completed.");
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const missingTokenRedirect = getMissingTokenAuthenticatedRedirect(user);

  if (missingTokenRedirect) {
    redirect(missingTokenRedirect);
  }

  // redirect the user to an error page with some instructions
  redirectAuthError(
    "This email confirmation link is missing its verification token. Please request a new confirmation email."
  );
}
