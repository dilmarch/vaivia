import {
  loadAccount,
  updateAccountProfile,
} from "@/lib/account/accountDomain";
import { mobileAccountError, readMobileJson } from "@/lib/account/mobileRoute";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import { MOBILE_CONFIRM_CALLBACK_URL } from "@/lib/account/mobileAuthCallbacks";

export async function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, PATCH, OPTIONS");
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  try {
    return mobileSuccess(request, await loadAccount(context.supabase, context.user));
  } catch (error) {
    return mobileAccountError(request, error);
  }
}

export async function PATCH(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  try {
    const input = await readMobileJson(request);
    return mobileSuccess(
      request,
      await updateAccountProfile(context.supabase, context.user, input, {
        emailRedirectTo: MOBILE_CONFIRM_CALLBACK_URL,
      }),
    );
  } catch (error) {
    return mobileAccountError(request, error);
  }
}
