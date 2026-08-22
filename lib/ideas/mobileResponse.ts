import { IdeaMutationError } from "@/lib/ideas/mutations";
import { mobileError } from "@/lib/mobileApi/server";

export function ideaMutationErrorResponse(request: Request, error: unknown) {
  if (error instanceof IdeaMutationError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.status >= 500,
    });
  }
  console.error("Mobile idea mutation failed:", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return mobileError(request, {
    status: 500,
    code: "operation_failed",
    message: "The trip idea change could not be completed.",
    retryable: false,
  });
}
