import { mutateWishlist } from "@/lib/social/profileDomain";
import { readObject, socialErrorResponse } from "@/lib/social/mobileResponse";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, PATCH, DELETE, OPTIONS");
}
async function handle(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = await readObject(request);
  if (!body)
    return mobileError(request, {
      status: 400,
      code: "validation_error",
      message: "Wishlist details are required.",
    });
  try {
    return mobileSuccess(
      request,
      await mutateWishlist(auth.supabase, auth.user.id, body),
    );
  } catch (error) {
    return socialErrorResponse(request, error);
  }
}
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
