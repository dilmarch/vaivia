import { getGooglePlaceDetails } from "@/lib/ai/google-places";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ placeId: string }> };
export function OPTIONS(request: Request) { return mobileOptions(request, "GET, OPTIONS"); }
export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { placeId } = await params;
  const url = new URL(request.url);
  const result = await getGooglePlaceDetails({ placeId, sessionToken: url.searchParams.get("sessionToken"), signal: request.signal });
  if (result.status === "failure") {
    if (result.code === "no_results") return mobileError(request, { status: 404, code: "not_found", message: "Place not found." });
    const status = result.code === "rate_limited" ? 429 : result.code === "timeout" ? 504 : result.code === "missing_configuration" ? 503 : 502;
    return mobileError(request, { status, code: `places_${result.code}`, message: "Place details are temporarily unavailable.", retryable: true });
  }
  const place = result.data;
  return mobileSuccess(request, { place: { placeId: place.placeId, name: place.name, address: place.address, category: place.category, latitude: place.location.latitude, longitude: place.location.longitude, mapsUrl: place.mapsUrl, types: place.types, rating: place.rating, userRatingCount: place.userRatingCount } });
}
