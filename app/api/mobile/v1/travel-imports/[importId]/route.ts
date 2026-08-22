import {
  TravelImportError,
  addImportedFlights,
  ignoreTravelImport,
  loadTravelImportReview,
  normalizeTravelerSelection,
  retryTravelImport,
  type SubmittedImportFlight,
} from "@/lib/travel-imports/domain";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type RouteContext = { params: Promise<{ importId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, POST, OPTIONS");
}

function fail(request: Request, error: unknown) {
  if (error instanceof TravelImportError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }
  console.error("Mobile travel import action failed:", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return mobileError(request, {
    status: 500,
    code: "travel_import_action_failed",
    message: "VAIVIA could not update this travel import.",
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadTravelImportReview(
        auth.supabase,
        auth.user.id,
        (await context.params).importId,
      ),
    );
  } catch (error) {
    return fail(request, error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  let body: Record<string, unknown> | null = null;
  try {
    const value = await request.json();
    body =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
  } catch {
    body = null;
  }
  if (!body || typeof body.action !== "string") {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "Choose a travel import action.",
    });
  }
  const importId = (await context.params).importId;
  try {
    if (body.action === "retry") {
      return mobileSuccess(
        request,
        await retryTravelImport({
          supabase: auth.supabase,
          userId: auth.user.id,
          importId,
        }),
      );
    }
    if (body.action === "ignore") {
      return mobileSuccess(
        request,
        await ignoreTravelImport({
          supabase: auth.supabase,
          userId: auth.user.id,
          importId,
        }),
      );
    }
    if (body.action === "add-flights") {
      const tripId = typeof body.tripId === "string" ? body.tripId : "";
      const items = Array.isArray(body.items)
        ? body.items.filter((item): item is SubmittedImportFlight =>
            Boolean(
              item &&
              typeof item === "object" &&
              typeof (item as SubmittedImportFlight).item_id === "string",
            ),
          )
        : [];
      return mobileSuccess(
        request,
        await addImportedFlights({
          supabase: auth.supabase,
          userId: auth.user.id,
          importId,
          tripId,
          items,
          travelers: normalizeTravelerSelection(body.travelers),
        }),
      );
    }
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "Choose a supported travel import action.",
    });
  } catch (error) {
    return fail(request, error);
  }
}
