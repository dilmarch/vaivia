import {
  NotificationActionError,
  reviewNotification,
  updateNotificationState,
} from "@/lib/notifications/actions";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type RouteContext = { params: Promise<{ notificationId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "PATCH, POST, OPTIONS");
}

async function readBody(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function failure(request: Request, error: unknown) {
  if (error instanceof NotificationActionError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }
  console.error("Mobile notification action failed:", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return mobileError(request, {
    status: 500,
    code: "notification_action_failed",
    message: "VAIVIA could not update this notification.",
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = await readBody(request);
  const action = body?.action;
  if (action !== "read" && action !== "archive" && action !== "restore") {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "Choose a supported notification action.",
    });
  }
  try {
    return mobileSuccess(
      request,
      await updateNotificationState({
        supabase: auth.supabase,
        userId: auth.user.id,
        notificationId: (await context.params).notificationId,
        action,
      }),
    );
  } catch (error) {
    return failure(request, error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = await readBody(request);
  const action = body?.action;
  if (action !== "accept" && action !== "decline" && action !== "open") {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "Choose a supported review action.",
    });
  }
  try {
    return mobileSuccess(
      request,
      await reviewNotification({
        supabase: auth.supabase,
        userId: auth.user.id,
        notificationId: (await context.params).notificationId,
        action,
        stampPatch:
          body?.stampPatch && typeof body.stampPatch === "object"
            ? (body.stampPatch as Record<string, unknown>)
            : undefined,
      }),
    );
  } catch (error) {
    return failure(request, error);
  }
}
