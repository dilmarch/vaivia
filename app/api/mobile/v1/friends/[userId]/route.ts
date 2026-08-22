import {
  loadFriendProfile,
  mutateFriendship,
} from "@/lib/social/profileDomain";
import { readObject, socialErrorResponse } from "@/lib/social/mobileResponse";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type RouteContext = { params: Promise<{ userId: string }> };
export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, POST, OPTIONS");
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadFriendProfile(
        auth.supabase,
        auth.user.id,
        (await context.params).userId,
      ),
    );
  } catch (error) {
    return socialErrorResponse(request, error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = (await readObject(request)) || {};
  try {
    return mobileSuccess(
      request,
      await mutateFriendship(auth.supabase, auth.user.id, {
        ...body,
        userId: (await context.params).userId,
      }),
    );
  } catch (error) {
    return socialErrorResponse(request, error);
  }
}
