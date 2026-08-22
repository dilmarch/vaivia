import { createClient } from "@/lib/supabase/server";
import { ensureConfirmedAccountProfile } from "@/lib/account/accountDomain";
import {
  getAlreadyConfirmedAuthRedirect,
  getMissingTokenAuthenticatedRedirect,
  normalizeAuthConfirmNext,
} from "@/lib/authConfirmRedirect";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { getTrustedRequestOrigin } from "@/lib/appUrl";

function redirectAuthError(message: string): never {
  redirect(`/auth/error?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const appOrigin = getTrustedRequestOrigin(requestUrl.origin);
  const { searchParams } = requestUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = normalizeAuthConfirmNext(searchParams.get("next"), appOrigin);
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
        try {
          await ensureConfirmedAccountProfile(supabase, user);
        } catch (profileError) {
          console.warn("Could not finish account setup after email confirmation:", {
            message:
              profileError instanceof Error
                ? profileError.message
                : "unknown_error",
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
