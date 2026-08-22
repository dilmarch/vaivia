import { StayMutationError } from "@/lib/accommodations/mutations";
import { mobileError } from "@/lib/mobileApi/server";
import { TransportMutationError } from "@/lib/transport/mutations";

export function travelMutationErrorResponse(request: Request, error: unknown) {
  if (error instanceof StayMutationError || error instanceof TransportMutationError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.status >= 500,
    });
  }
  return mobileError(request, {
    status: 500,
    code: "operation_failed",
    message: "VAIVIA could not complete that travel update.",
    retryable: true,
  });
}
