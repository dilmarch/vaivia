import "server-only";

import { mobileError } from "@/lib/mobileApi/server";
import { ItineraryMutationError } from "./mutations";

export function itineraryMutationErrorResponse(request: Request, error: unknown) {
  if (error instanceof ItineraryMutationError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.status >= 500,
    });
  }
  console.error("Mobile itinerary mutation failed:", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return mobileError(request, {
    status: 500,
    code: "operation_failed",
    message: "VAIVIA could not complete that itinerary change.",
    retryable: false,
  });
}
