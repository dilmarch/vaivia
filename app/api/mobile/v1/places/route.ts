import { autocompleteGooglePlaces, searchGooglePlaces } from "@/lib/ai/google-places";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";

export const dynamic = "force-dynamic";
export function OPTIONS(request: Request) { return mobileOptions(request, "GET, OPTIONS"); }

function providerError(request: Request, code: string) {
  if (code === "no_results") return mobileSuccess(request, { places: [] });
  const status = code === "rate_limited" ? 429 : code === "timeout" ? 504 : code === "missing_configuration" ? 503 : 502;
  return mobileError(request, { status, code: `places_${code}`, message: code === "missing_configuration" ? "Place search is not configured." : "Place search is temporarily unavailable.", retryable: status >= 500 || status === 429 });
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") || "").trim();
  if (query.length < 2) return mobileSuccess(request, { places: [] });
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const nearby = Number.isFinite(lat) && Number.isFinite(lng);
  const result = nearby
    ? await searchGooglePlaces({ query, origin: { latitude: lat, longitude: lng }, radiusMeters: Number(url.searchParams.get("radius")) || 5_000, maxResults: 10, signal: request.signal })
    : await autocompleteGooglePlaces({ input: query, sessionToken: url.searchParams.get("sessionToken"), signal: request.signal });
  if (result.status === "failure") return providerError(request, result.code);
  return mobileSuccess(request, { places: result.data });
}
