import { authenticateMobileRequest, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { createStayForUser, parseStayMutationInput } from "@/lib/accommodations/mutations";
import { readJsonObject } from "@/lib/trips/mobileResponse";
import { travelMutationErrorResponse } from "@/lib/travel/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ tripId: string }> };
export function OPTIONS(request: Request) { return mobileOptions(request, "POST, OPTIONS"); }
export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  try {
    const stay = await createStayForUser({ supabase: context.supabase, userId: context.user.id, tripId, input: parseStayMutationInput(await readJsonObject(request)) });
    return mobileSuccess(request, { stay }, { status: 201 });
  } catch (error) { return travelMutationErrorResponse(request, error); }
}
