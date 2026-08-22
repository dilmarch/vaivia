import { requestAccountDeletion } from "@/lib/account/accountDomain";
import { mobileAccountError } from "@/lib/account/mobileRoute";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

export async function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("confirmation" in body) ||
    body.confirmation !== "DELETE MY ACCOUNT"
  ) {
    return mobileError(request, {
      status: 422,
      code: "confirmation_required",
      message: 'Type "DELETE MY ACCOUNT" to confirm this request.',
      fieldErrors: {
        confirmation: ['Type "DELETE MY ACCOUNT" exactly.'],
      },
    });
  }
  try {
    return mobileSuccess(
      request,
      await requestAccountDeletion(context.supabase, context.user.id),
    );
  } catch (error) {
    return mobileAccountError(request, error);
  }
}
