import "server-only";

import { mobileError } from "@/lib/mobileApi/server";
import { TripLifecycleError } from "./lifecycle";

export function tripMutationErrorResponse(request: Request, error: unknown) {
  if (error instanceof TripLifecycleError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.status >= 500,
    });
  }
  console.error("Mobile trip mutation failed:", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return mobileError(request, {
    status: 500,
    code: "operation_failed",
    message: "VAIVIA could not complete that trip change.",
    retryable: false,
  });
}

export async function readJsonObject(request: Request) {
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
