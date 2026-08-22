import type {
  MobileApiFieldErrors,
  MobileApiErrorResponse,
  MobileAccountResponse,
  MobileDataExportsResponse,
  MobileHomeResponse,
  MobileNotificationHistoryResponse,
  MobileNotificationsResponse,
  MobileTripCollaborationResponse,
  MobileTripDetailResponse,
  MobileTripMutationInput,
  MobileTripMutationResponse,
  MobileTripsResponse,
  MobileSettingsResponse,
} from "@/lib/mobileApi/contracts";

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "request_failed",
    readonly fieldErrors?: MobileApiFieldErrors,
    readonly retryable =
      status === 0 || status === 408 || status === 429 || status >= 500,
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

export type MobileApiAuthState = {
  sessionExists: boolean;
  accessToken: string | null;
  authenticatedUserId: string | null;
};

type MobileApiClientOptions = {
  baseUrl: string;
  getAuthState: () => MobileApiAuthState | Promise<MobileApiAuthState>;
  fetchImplementation?: typeof fetch;
  onUnauthorized?: () => void | Promise<void>;
};

export type MobileApiRequestPolicy = {
  timeoutMs?: number | null;
  idempotencyKey?: string;
};

export type MobileApiJsonRequestOptions = MobileApiRequestPolicy & {
  signal?: AbortSignal;
  headers?: HeadersInit;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const defaultFetch: typeof fetch = (...args) => window.fetch(...args);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseFieldErrors(value: unknown): MobileApiFieldErrors | undefined {
  if (!isRecord(value)) return undefined;
  const fieldErrors: MobileApiFieldErrors = {};
  for (const [field, messages] of Object.entries(value)) {
    if (!Array.isArray(messages)) continue;
    const safeMessages = messages.filter(
      (message): message is string => typeof message === "string",
    );
    if (safeMessages.length) fieldErrors[field] = safeMessages;
  }
  return Object.keys(fieldErrors).length ? fieldErrors : undefined;
}

function defaultErrorCode(status: number) {
  if (status === 400 || status === 422) return "validation_error";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "request_failed";
}

function parseErrorResponse(body: unknown, status: number) {
  const response = isRecord(body) ? body : null;
  const nestedError = isRecord(response?.error) ? response.error : null;
  const legacyMessage =
    typeof response?.error === "string" ? response.error : null;
  const message =
    (typeof nestedError?.message === "string" && nestedError.message) ||
    (typeof response?.message === "string" && response.message) ||
    legacyMessage ||
    `VAIVIA request failed (${status}).`;
  const code =
    (typeof nestedError?.code === "string" && nestedError.code) ||
    (typeof response?.code === "string" && response.code) ||
    defaultErrorCode(status);
  const fieldErrors = parseFieldErrors(
    nestedError?.fieldErrors ?? response?.fieldErrors,
  );
  const explicitRetryable =
    typeof nestedError?.retryable === "boolean"
      ? nestedError.retryable
      : typeof response?.retryable === "boolean"
        ? response.retryable
        : undefined;
  return { message, code, fieldErrors, explicitRetryable };
}

function unwrapSuccessEnvelope<T>(body: unknown): T {
  if (isRecord(body) && Object.hasOwn(body, "data")) return body.data as T;
  return body as T;
}

function createRequestAbortState(
  sourceSignal: AbortSignal | null | undefined,
  timeoutMs: number | null,
) {
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const abortFromSource = () => controller.abort();
  if (sourceSignal?.aborted) {
    abortFromSource();
  } else {
    sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
  }

  if (timeoutMs !== null && timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose() {
      if (timeout) clearTimeout(timeout);
      sourceSignal?.removeEventListener("abort", abortFromSource);
    },
  };
}

export class MobileApiClient {
  private readonly baseUrl: string;
  private readonly getAuthState: MobileApiClientOptions["getAuthState"];
  private readonly fetchImplementation: typeof fetch;
  private readonly onUnauthorized?: MobileApiClientOptions["onUnauthorized"];
  private unauthorizedHandling: Promise<void> | null = null;
  private readonly inFlightMutations = new Map<string, Promise<unknown>>();

  constructor(options: MobileApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getAuthState = options.getAuthState;
    this.fetchImplementation = options.fetchImplementation ?? defaultFetch;
    this.onUnauthorized = options.onUnauthorized;
  }

  private async handleUnauthorized() {
    if (!this.onUnauthorized) return;
    if (!this.unauthorizedHandling) {
      this.unauthorizedHandling = Promise.resolve(this.onUnauthorized())
        .catch(() => undefined)
        .finally(() => {
          this.unauthorizedHandling = null;
        });
    }
    await this.unauthorizedHandling;
  }

  private async executeAuthenticatedRequest<T>(
    path: string,
    init: RequestInit,
    policy: MobileApiRequestPolicy,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    const requestUrl = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const authState = await this.getAuthState();
    const accessToken = authState.accessToken;

    console.info("[VAIVIA mobile API] request", {
      sessionExists: authState.sessionExists,
      accessTokenExists: Boolean(accessToken),
      authenticatedUserId: authState.authenticatedUserId,
      requestUrl,
    });

    if (!accessToken) {
      await this.handleUnauthorized();
      throw new MobileApiError(
        "Your session has expired. Please sign in again.",
        401,
        "missing_access_token",
      );
    }

    const timeoutMs =
      policy.timeoutMs === undefined
        ? DEFAULT_REQUEST_TIMEOUT_MS
        : policy.timeoutMs;
    const abortState = createRequestAbortState(init.signal, timeoutMs);
    let response: Response | null = null;
    try {
      const headers = new Headers(init.headers);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${accessToken}`);
      if (policy.idempotencyKey && !headers.has("Idempotency-Key")) {
        headers.set("Idempotency-Key", policy.idempotencyKey);
      }
      response = await this.fetchImplementation(requestUrl, {
        ...init,
        headers,
        signal: abortState.signal,
      });

      console.info("[VAIVIA mobile API] response", {
        requestUrl,
        httpResponseStatus: response.status,
      });

      if (response.status === 401) await this.handleUnauthorized();
      return await consume(response);
    } catch (error) {
      if (!response) {
        console.error("[VAIVIA mobile API] response", {
          requestUrl,
          httpResponseStatus: null,
          failureKind: abortState.didTimeOut()
            ? "timeout"
            : init.signal?.aborted
              ? "cancelled"
              : "network",
        });
      }
      if (abortState.didTimeOut()) {
        throw new MobileApiError(
          "VAIVIA took too long to respond. Please try again.",
          408,
          "timeout",
        );
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError(
        "VAIVIA could not connect. Check your connection and try again.",
        0,
        "network_error",
        undefined,
        true,
      );
    } finally {
      abortState.dispose();
    }
  }

  async requestAuthenticated(
    path: string,
    init: RequestInit = {},
    policy: MobileApiRequestPolicy = {},
  ): Promise<Response> {
    return this.executeAuthenticatedRequest(
      path,
      init,
      policy,
      async (response) => response,
    );
  }

  async requestJson<T>(
    path: string,
    init: RequestInit = {},
    policy: MobileApiRequestPolicy = {},
  ): Promise<T> {
    return this.executeAuthenticatedRequest(
      path,
      init,
      policy,
      async (response) => {
        const responseText = await response.text();
        let body: T | MobileApiErrorResponse | null = null;
        if (responseText) {
          try {
            body = JSON.parse(responseText) as T | MobileApiErrorResponse;
          } catch {
            if (response.ok) {
              throw new MobileApiError(
                "VAIVIA returned an invalid response. Please try again.",
                502,
                "invalid_json",
              );
            }
          }
        }

        if (!response.ok) {
          const parsedError = parseErrorResponse(body, response.status);
          throw new MobileApiError(
            parsedError.message,
            response.status,
            parsedError.code,
            parsedError.fieldErrors,
            parsedError.explicitRetryable,
          );
        }

        return unwrapSuccessEnvelope<T>(body);
      },
    );
  }

  getJson<T>(path: string, options: MobileApiJsonRequestOptions = {}) {
    const { signal, headers, ...policy } = options;
    return this.requestJson<T>(path, { method: "GET", headers, signal }, policy);
  }

  postJson<T>(
    path: string,
    body: unknown,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.mutateJson<T>("POST", path, body, options);
  }

  patchJson<T>(
    path: string,
    body: unknown,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.mutateJson<T>("PATCH", path, body, options);
  }

  putJson<T>(
    path: string,
    body: unknown,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.mutateJson<T>("PUT", path, body, options);
  }

  deleteJson<T>(
    path: string,
    body?: unknown,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.mutateJson<T>("DELETE", path, body, options);
  }

  private mutateJson<T>(
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body: unknown,
    options: MobileApiJsonRequestOptions,
  ) {
    const { signal, headers: initialHeaders, ...policy } = options;
    const headers = new Headers(initialHeaders);
    let requestBody: string | undefined;
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    }
    const execute = () =>
      this.requestJson<T>(
        path,
        { method, headers, body: requestBody, signal },
        policy,
      );
    if (!policy.idempotencyKey) return execute();

    const mutationKey = `${method}:${path}:${policy.idempotencyKey}`;
    const existing = this.inFlightMutations.get(mutationKey);
    if (existing) return existing as Promise<T>;

    const request = execute().finally(() => {
      if (this.inFlightMutations.get(mutationKey) === request) {
        this.inFlightMutations.delete(mutationKey);
      }
    });
    this.inFlightMutations.set(mutationKey, request);
    return request;
  }

  getTrips(signal?: AbortSignal) {
    return this.getJson<MobileTripsResponse>("/api/mobile/v1/trips", { signal });
  }

  getHome(signal?: AbortSignal) {
    return this.getJson<MobileHomeResponse>("/api/mobile/v1/home", { signal });
  }

  getNotifications(signal?: AbortSignal) {
    return this.getJson<MobileNotificationsResponse>(
      "/api/mobile/v1/notifications",
      { signal },
    );
  }

  getNotificationHistory(signal?: AbortSignal) {
    return this.getJson<MobileNotificationHistoryResponse>(
      "/api/mobile/v1/notifications?view=history",
      { signal },
    );
  }

  getTrip(tripId: string, signal?: AbortSignal) {
    return this.getJson<MobileTripDetailResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      { signal },
    );
  }

  createTrip(input: MobileTripMutationInput, options: MobileApiJsonRequestOptions = {}) {
    return this.postJson<MobileTripMutationResponse>("/api/mobile/v1/trips", input, options);
  }

  updateTrip(tripId: string, input: MobileTripMutationInput, options: MobileApiJsonRequestOptions = {}) {
    return this.patchJson<MobileTripMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      input,
      options,
    );
  }

  setTripArchived(tripId: string, archived: boolean, options: MobileApiJsonRequestOptions = {}) {
    return this.patchJson<MobileTripMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      { operation: archived ? "archive" : "restore" },
      options,
    );
  }

  deleteTrip(tripId: string, confirmation: string, options: MobileApiJsonRequestOptions = {}) {
    return this.deleteJson<{ deleted: true; tripId: string }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      { confirmation },
      options,
    );
  }

  getTripCollaboration(tripId: string, signal?: AbortSignal) {
    return this.getJson<MobileTripCollaborationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/collaboration`,
      { signal },
    );
  }

  inviteTripCollaborator(
    tripId: string,
    input: { inviteeIdentifier: string; consentConfirmed: boolean; legIds: string[] },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ invitationId: string }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/invitations`,
      input,
      options,
    );
  }

  cancelTripInvitation(tripId: string, invitationId: string, options: MobileApiJsonRequestOptions = {}) {
    return this.deleteJson<{ cancelled: true }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/invitations`,
      { invitationId },
      options,
    );
  }

  removeTripMember(tripId: string, memberUserId: string, options: MobileApiJsonRequestOptions = {}) {
    return this.deleteJson<{ removed: true }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/members`,
      { memberUserId },
      options,
    );
  }

  setTripFamilyMember(
    tripId: string,
    familyMemberId: string,
    included: boolean,
    options: MobileApiJsonRequestOptions = {},
  ) {
    const path = `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/family-members`;
    return included
      ? this.postJson<{ included: boolean }>(path, { familyMemberId }, options)
      : this.deleteJson<{ included: boolean }>(path, { familyMemberId }, options);
  }

  updateTripMemberScope(
    tripId: string,
    input: { tripMemberId: string; startDate: string; endDate: string; legIds: string[] },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ updated: true }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/members`,
      input,
      options,
    );
  }

  uploadTripCover(tripId: string, file: File, options: MobileApiJsonRequestOptions = {}) {
    const { signal, headers, ...policy } = options;
    const formData = new FormData();
    formData.set("cover_upload_file", file);
    return this.requestJson<MobileTripMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/cover`,
      { method: "POST", headers, body: formData, signal },
      policy,
    );
  }

  removeTripCover(tripId: string, options: MobileApiJsonRequestOptions = {}) {
    return this.deleteJson<MobileTripMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/cover`,
      undefined,
      options,
    );
  }

  getAccount(signal?: AbortSignal) {
    return this.getJson<MobileAccountResponse>("/api/mobile/v1/me", { signal });
  }

  updateAccount(
    input: { firstName: string; lastName: string; username: string; email: string },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<MobileAccountResponse>("/api/mobile/v1/me", input, options);
  }

  confirmAccount(options: MobileApiJsonRequestOptions = {}) {
    return this.postJson<{ confirmed: boolean }>(
      "/api/mobile/v1/me/confirmation",
      {},
      options,
    );
  }

  getSettings(signal?: AbortSignal) {
    return this.getJson<MobileSettingsResponse>("/api/mobile/v1/settings", { signal });
  }

  updateSettings(input: Record<string, unknown>, options: MobileApiJsonRequestOptions = {}) {
    return this.patchJson<MobileSettingsResponse>(
      "/api/mobile/v1/settings",
      input,
      options,
    );
  }

  getDataExports(signal?: AbortSignal) {
    return this.getJson<MobileDataExportsResponse>(
      "/api/mobile/v1/data-exports",
      { signal },
    );
  }

  requestDataExport(options: MobileApiJsonRequestOptions = {}) {
    return this.postJson<{ exportId: string; status: string; expiresAt?: string }>(
      "/api/mobile/v1/data-exports",
      {},
      options,
    );
  }

  getDataExportDownload(exportId: string, options: MobileApiJsonRequestOptions = {}) {
    return this.postJson<{ url: string; expiresInSeconds: number }>(
      `/api/mobile/v1/data-exports/${encodeURIComponent(exportId)}/download`,
      {},
      options,
    );
  }

  requestAccountDeletion(
    confirmation: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ requestedAt: string }>(
      "/api/mobile/v1/account/deletion",
      { confirmation },
      options,
    );
  }
}
