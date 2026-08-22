import { ensureConfirmedAccountProfile } from "@/lib/account/accountDomain";
import { mobileAccountError } from "@/lib/account/mobileRoute";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

export async function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  try {
    await ensureConfirmedAccountProfile(context.supabase, context.user);
    return mobileSuccess(request, { confirmed: true });
  } catch (error) {
    return mobileAccountError(request, error);
  }
}
