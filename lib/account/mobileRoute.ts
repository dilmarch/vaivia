import { AccountDomainError } from "@/lib/account/accountDomain";
import { mobileError } from "@/lib/mobileApi/server";

export function mobileAccountError(request: Request, error: unknown) {
  if (error instanceof AccountDomainError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    });
  }
  console.error("Mobile account operation failed", {
    message: error instanceof Error ? error.message : "unknown_error",
  });
  return mobileError(request, {
    status: 500,
    code: "account_operation_failed",
    message: "VAIVIA could not complete that account request.",
    retryable: true,
  });
}

export async function readMobileJson(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new AccountDomainError(
      "Send a valid JSON request body.",
      "invalid_json",
      400,
    );
  }
}
