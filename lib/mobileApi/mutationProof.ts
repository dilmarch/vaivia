import "server-only";
import {
  authenticateMobileRequest,
  mobileError,
  mobileSuccess,
  type MobileRequestContext,
} from "@/lib/mobileApi/server";

export type IsolatedMutationRecord = {
  id: string;
  ownerUserId: string;
  label: string;
  version: number;
};

export type IsolatedMutationPayload = {
  label: string;
  expectedVersion: number;
};

type IsolatedMutationResult =
  | { ok: true; record: IsolatedMutationRecord }
  | {
      ok: false;
      status: 403 | 409 | 422;
      code: "forbidden" | "conflict" | "validation_error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export function applyIsolatedMutation(
  actorUserId: string,
  record: IsolatedMutationRecord,
  payload: IsolatedMutationPayload,
): IsolatedMutationResult {
  if (record.ownerUserId !== actorUserId) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "You do not have access to this record.",
    };
  }
  if (!payload.label.trim()) {
    return {
      ok: false,
      status: 422,
      code: "validation_error",
      message: "Please correct the highlighted fields.",
      fieldErrors: { label: ["Label is required."] },
    };
  }
  if (payload.expectedVersion !== record.version) {
    return {
      ok: false,
      status: 409,
      code: "conflict",
      message: "This record changed before your update was applied.",
    };
  }
  return {
    ok: true,
    record: {
      ...record,
      label: payload.label.trim(),
      version: record.version + 1,
    },
  };
}

type Authenticate = (
  request: Request,
) => Promise<MobileRequestContext | Response>;

export async function executeIsolatedMutationProof(
  request: Request,
  record: IsolatedMutationRecord,
  payload: IsolatedMutationPayload,
  authenticate: Authenticate = authenticateMobileRequest,
) {
  const context = await authenticate(request);
  if (context instanceof Response) return context;

  const result = applyIsolatedMutation(context.user.id, record, payload);
  if (!result.ok) {
    return mobileError(request, {
      status: result.status,
      code: result.code,
      message: result.message,
      fieldErrors: result.fieldErrors,
    });
  }
  return mobileSuccess(request, { record: result.record });
}
