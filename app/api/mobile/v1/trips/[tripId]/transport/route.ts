import { authenticateMobileRequest, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";
import { createTransportationForUser, parseTransportationMutationInput } from "@/lib/transport/mutations";
import { travelMutationErrorResponse } from "@/lib/travel/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) { return mobileOptions(request, "POST, OPTIONS"); }

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  try {
    const item = await createTransportationForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      input: parseTransportationMutationInput(await readJsonObject(request)),
    });
    return mobileSuccess(request, { item }, { status: 201 });
  } catch (error) { return travelMutationErrorResponse(request, error); }
}
