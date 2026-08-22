import { EventAttendeeError } from "@/lib/events/attendee";
import { EventOperationsError } from "@/lib/events/operations";
import { mobileError } from "@/lib/mobileApi/server";

export function eventMobileError(request: Request, error: unknown) {
  if (error instanceof EventAttendeeError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      retryable: error.status >= 500,
    });
  }
  console.error("Event attendee operation failed", {
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return mobileError(request, {
    status: 500,
    code: "server_error",
    message: "The event request could not be completed.",
    retryable: true,
  });
}

export function eventOperationsMobileError(request: Request, error: unknown) {
  if (error instanceof EventOperationsError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      retryable: error.status >= 500,
    });
  }
  console.error("Event operations request failed", {
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return mobileError(request, {
    status: 500,
    code: "server_error",
    message: "The event operations request could not be completed.",
    retryable: true,
  });
}
