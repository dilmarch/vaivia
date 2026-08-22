import { BudgetMutationError } from "@/lib/budget/mutations";
import { mobileError } from "@/lib/mobileApi/server";

export function budgetMutationErrorResponse(request: Request, error: unknown) {
  if (error instanceof BudgetMutationError) {
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
    message: "The budget change could not be completed.",
    retryable: false,
  });
}
