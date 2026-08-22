import { listAttendeeEvents } from "@/lib/events/attendee";
import { eventMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  try {
    const result = await listAttendeeEvents({
      query: url.searchParams.get("q") || undefined,
      category: url.searchParams.get("category") || undefined,
      city: url.searchParams.get("city") || undefined,
      price:
        url.searchParams.get("price") === "free" ||
        url.searchParams.get("price") === "paid"
          ? (url.searchParams.get("price") as "free" | "paid")
          : undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      page: Number(url.searchParams.get("page")) || 1,
    });
    return mobileSuccess(request, {
      ...result,
      totalPages: Math.max(1, Math.ceil(result.count / result.pageSize)),
    });
  } catch (error) {
    return eventMobileError(request, error);
  }
}
