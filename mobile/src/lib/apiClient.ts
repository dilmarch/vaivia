import type {
  MobileApiFieldErrors,
  MobileApiErrorResponse,
  MobileAccountResponse,
  MobileDataExportsResponse,
  MobileHomeResponse,
  MobileItineraryEditorResponse,
  MobileItineraryMutationInput,
  MobileItineraryMutationResponse,
  MobileNotificationHistoryResponse,
  MobileNotificationsResponse,
  MobileTripCollaborationResponse,
  MobileTripDetailResponse,
  MobileTripMutationInput,
  MobileTripMutationResponse,
  MobileTripsResponse,
  MobileSettingsResponse,
  MobileBudgetMutationInput,
  MobileExpenseMutationInput,
  MobileSettlementMutationInput,
  MobileIdeaMutationInput,
  MobilePlaceDetails,
  MobilePlaceSuggestion,
  MobileStayMutationInput,
  MobileTransportationMutationInput,
  MobileFriendProfileResponse,
  MobileNotificationDestination,
  MobileSocialProfileResponse,
  MobileTravelImportReviewResponse,
  MobileTravelImportsResponse,
  MobileEventCheckoutStatusResponse,
  MobileEventDetailResponse,
  MobileEventRegistrationResponse,
  MobileEventsResponse,
  MobileEventTicketResponse,
  MobileMyEventsResponse,
} from "@/lib/mobileApi/contracts";
import type {
  EventCheckInResult,
  EventOperationsDetail,
  EventOperationsListItem,
  EventOperationsRole,
} from "@/lib/events/operationsContracts";

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "request_failed",
    readonly fieldErrors?: MobileApiFieldErrors,
    readonly retryable = status === 0 ||
      status === 408 ||
      status === 429 ||
      status >= 500,
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
    return this.requestJson<T>(
      path,
      { method: "GET", headers, signal },
      policy,
    );
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
    return this.getJson<MobileTripsResponse>("/api/mobile/v1/trips", {
      signal,
    });
  }

  getEvents(
    filters: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(filters)) {
      if (value !== undefined && String(value).trim()) query.set(name, String(value));
    }
    return this.getJson<MobileEventsResponse>(
      `/api/mobile/v1/events${query.size ? `?${query.toString()}` : ""}`,
      { signal },
    );
  }

  getEvent(eventId: string, signal?: AbortSignal) {
    return this.getJson<MobileEventDetailResponse>(
      `/api/mobile/v1/events/${encodeURIComponent(eventId)}`,
      { signal },
    );
  }

  setEventSaved(eventId: string, saved: boolean, options: MobileApiJsonRequestOptions = {}) {
    return this.patchJson<{ eventId: string; saved: boolean }>(
      `/api/mobile/v1/events/${encodeURIComponent(eventId)}`,
      { saved },
      options,
    );
  }

  registerEvent(
    eventId: string,
    input: {
      mode: "rsvp" | "tickets";
      attendeeName?: string;
      idempotencyKey?: string;
      selections?: Array<{ ticketTypeId: string; quantity: number }>;
    },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<MobileEventRegistrationResponse>(
      `/api/mobile/v1/events/${encodeURIComponent(eventId)}`,
      input,
      options,
    );
  }

  cancelEventRsvp(eventId: string, options: MobileApiJsonRequestOptions = {}) {
    return this.deleteJson<{ eventId: string; cancelled: true }>(
      `/api/mobile/v1/events/${encodeURIComponent(eventId)}`,
      undefined,
      options,
    );
  }

  getMyEvents(signal?: AbortSignal) {
    return this.getJson<MobileMyEventsResponse>("/api/mobile/v1/my-events", { signal });
  }

  getManagedEvents(signal?: AbortSignal) {
    return this.getJson<{
      role: EventOperationsRole;
      events: EventOperationsListItem[];
    }>("/api/mobile/v1/organizer/events", { signal });
  }

  getManagedEvent(eventId: string, signal?: AbortSignal) {
    return this.getJson<EventOperationsDetail>(
      `/api/mobile/v1/organizer/events/${encodeURIComponent(eventId)}`,
      { signal },
    );
  }

  checkInEvent(
    eventId: string,
    value: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<EventCheckInResult>(
      `/api/mobile/v1/organizer/events/${encodeURIComponent(eventId)}/check-in`,
      { value },
      options,
    );
  }

  undoEventCheckIn(
    eventId: string,
    ticketId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ ticketId: string; status: "active" }>(
      `/api/mobile/v1/organizer/events/${encodeURIComponent(eventId)}/check-in`,
      { ticketId },
      options,
    );
  }

  getEventTicket(ticketId: string, signal?: AbortSignal) {
    return this.getJson<MobileEventTicketResponse>(
      `/api/mobile/v1/event-tickets/${encodeURIComponent(ticketId)}`,
      { signal },
    );
  }

  getEventCheckoutStatus(orderId: string, signal?: AbortSignal) {
    return this.getJson<MobileEventCheckoutStatusResponse>(
      `/api/mobile/v1/event-orders/${encodeURIComponent(orderId)}`,
      { signal },
    );
  }

  async downloadAppleWalletPass(ticketId: string, signal?: AbortSignal) {
    const response = await this.requestAuthenticated(
      `/api/mobile/v1/event-tickets/${encodeURIComponent(ticketId)}/apple-wallet`,
      { method: "GET", signal },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const parsed = parseErrorResponse(body, response.status);
      throw new MobileApiError(parsed.message, response.status, parsed.code);
    }
    return response.blob();
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

  updateNotification(
    notificationId: string,
    action: "read" | "archive" | "restore",
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ notification: unknown }>(
      `/api/mobile/v1/notifications/${encodeURIComponent(notificationId)}`,
      { action },
      options,
    );
  }

  reviewNotification(
    notificationId: string,
    action: "accept" | "decline" | "open",
    stampPatch?: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{
      handled: true;
      destination: MobileNotificationDestination | null;
    }>(
      `/api/mobile/v1/notifications/${encodeURIComponent(notificationId)}`,
      { action, stampPatch },
      options,
    );
  }

  getTravelImports(signal?: AbortSignal) {
    return this.getJson<MobileTravelImportsResponse>(
      "/api/mobile/v1/travel-imports",
      { signal },
    );
  }

  getTravelImport(importId: string, signal?: AbortSignal) {
    return this.getJson<MobileTravelImportReviewResponse>(
      `/api/mobile/v1/travel-imports/${encodeURIComponent(importId)}`,
      { signal },
    );
  }

  mutateTravelImport(
    importId: string,
    input: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<Record<string, unknown>>(
      `/api/mobile/v1/travel-imports/${encodeURIComponent(importId)}`,
      input,
      options,
    );
  }

  getTrip(tripId: string, signal?: AbortSignal) {
    return this.getJson<MobileTripDetailResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      { signal },
    );
  }

  createTransportation(
    tripId: string,
    input: MobileTransportationMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ item: unknown }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/transport`,
      input,
      options,
    );
  }

  getTransportation(tripId: string, itemId: string, signal?: AbortSignal) {
    return this.getJson<{
      item: Record<string, unknown>;
      participants: Array<Record<string, unknown>>;
    }>(
      `/api/mobile/v1/transport/${encodeURIComponent(itemId)}?tripId=${encodeURIComponent(tripId)}`,
      { signal },
    );
  }

  updateTransportation(
    tripId: string,
    itemId: string,
    input: MobileTransportationMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ item: unknown }>(
      `/api/mobile/v1/transport/${encodeURIComponent(itemId)}`,
      { ...input, tripId },
      options,
    );
  }

  deleteTransportation(
    tripId: string,
    itemId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ deleted: true; itemId: string }>(
      `/api/mobile/v1/transport/${encodeURIComponent(itemId)}`,
      { tripId },
      options,
    );
  }

  createStay(
    tripId: string,
    input: MobileStayMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ stay: unknown }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/stays`,
      input,
      options,
    );
  }

  getStay(tripId: string, stayId: string, signal?: AbortSignal) {
    return this.getJson<{
      stay: Record<string, unknown>;
      participants: Array<Record<string, unknown>>;
    }>(
      `/api/mobile/v1/stays/${encodeURIComponent(stayId)}?tripId=${encodeURIComponent(tripId)}`,
      { signal },
    );
  }

  updateStay(
    tripId: string,
    stayId: string,
    input: MobileStayMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ stay: unknown }>(
      `/api/mobile/v1/stays/${encodeURIComponent(stayId)}`,
      { ...input, tripId },
      options,
    );
  }

  promoteStay(
    tripId: string,
    stayId: string,
    input: MobileStayMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ stay: unknown }>(
      `/api/mobile/v1/stays/${encodeURIComponent(stayId)}`,
      { ...input, tripId, operation: "promote" },
      options,
    );
  }

  deleteStay(
    tripId: string,
    stayId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ deleted: true; stayId: string }>(
      `/api/mobile/v1/stays/${encodeURIComponent(stayId)}`,
      { tripId },
      options,
    );
  }

  searchPlaces(query: string, sessionToken: string, signal?: AbortSignal) {
    const search = new URLSearchParams({ query, sessionToken });
    return this.getJson<{ places: MobilePlaceSuggestion[] }>(
      `/api/mobile/v1/places?${search.toString()}`,
      { signal },
    );
  }

  searchNearbyPlaces(
    query: string,
    latitude: number,
    longitude: number,
    signal?: AbortSignal,
  ) {
    const search = new URLSearchParams({
      query,
      lat: String(latitude),
      lng: String(longitude),
    });
    return this.getJson<{ places: MobilePlaceDetails[] }>(
      `/api/mobile/v1/places?${search.toString()}`,
      { signal },
    );
  }

  getPlaceDetails(placeId: string, sessionToken: string, signal?: AbortSignal) {
    const search = new URLSearchParams({ sessionToken });
    return this.getJson<{ place: MobilePlaceDetails }>(
      `/api/mobile/v1/places/${encodeURIComponent(placeId)}?${search.toString()}`,
      { signal },
    );
  }

  createIdea(
    tripId: string,
    input: MobileIdeaMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ idea: unknown }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/ideas`,
      input,
      options,
    );
  }

  createIdeasFromNotepad(
    tripId: string,
    entries: string[],
    locations: Array<Record<string, unknown>>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ ideas: unknown[] }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/ideas`,
      { operation: "bulk", entries, locations },
      options,
    );
  }

  updateIdea(
    tripId: string,
    ideaId: string,
    input: MobileIdeaMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ idea: unknown }>(
      `/api/mobile/v1/ideas/${encodeURIComponent(ideaId)}`,
      { ...input, tripId },
      options,
    );
  }

  deleteIdea(
    tripId: string,
    ideaId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ deleted: true; ideaId: string }>(
      `/api/mobile/v1/ideas/${encodeURIComponent(ideaId)}`,
      { tripId },
      options,
    );
  }

  setIdeaAttended(
    tripId: string,
    ideaId: string,
    attended: boolean,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ idea: unknown }>(
      `/api/mobile/v1/ideas/${encodeURIComponent(ideaId)}`,
      { tripId, operation: "attended", attended },
      options,
    );
  }

  toggleIdeaReaction(
    tripId: string,
    ideaId: string,
    reaction: "heart" | "thumbs_up" | "thumbs_down",
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.putJson<{
      reaction: "heart" | "thumbs_up" | "thumbs_down" | null;
    }>(
      `/api/mobile/v1/ideas/${encodeURIComponent(ideaId)}/reaction`,
      { tripId, reaction },
      options,
    );
  }

  addIdeaToItinerary(
    tripId: string,
    ideaId: string,
    input: {
      itemDate: string;
      startTime?: string | null;
      endTime?: string | null;
      timezone?: string | null;
      timezoneSource?: string | null;
    },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<MobileItineraryMutationResponse>(
      `/api/mobile/v1/ideas/${encodeURIComponent(ideaId)}/itinerary`,
      { ...input, tripId },
      options,
    );
  }

  createBudget(
    tripId: string,
    input: MobileBudgetMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/budget`,
      input,
      options,
    );
  }

  updateBudget(
    tripId: string,
    input: MobileBudgetMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/budget`,
      input,
      options,
    );
  }

  createExpense(
    tripId: string,
    input: MobileExpenseMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/expenses`,
      input,
      options,
    );
  }

  updateExpense(
    tripId: string,
    expenseId: string,
    input: MobileExpenseMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson(
      `/api/mobile/v1/expenses/${encodeURIComponent(expenseId)}`,
      { ...input, tripId },
      options,
    );
  }

  duplicateExpense(
    tripId: string,
    expenseId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson(
      `/api/mobile/v1/expenses/${encodeURIComponent(expenseId)}`,
      { tripId, operation: "duplicate" },
      options,
    );
  }

  deleteExpense(
    tripId: string,
    expenseId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ deleted: true; expenseId: string }>(
      `/api/mobile/v1/expenses/${encodeURIComponent(expenseId)}`,
      { tripId },
      options,
    );
  }

  createSettlement(
    input: MobileSettlementMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson("/api/mobile/v1/settlements", input, options);
  }

  getItineraryEditor(tripId: string, itemId?: string, signal?: AbortSignal) {
    const path = itemId
      ? `/api/mobile/v1/itinerary/${encodeURIComponent(itemId)}?tripId=${encodeURIComponent(tripId)}`
      : `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/itinerary`;
    return this.getJson<MobileItineraryEditorResponse>(path, { signal });
  }

  createItineraryItem(
    tripId: string,
    input: MobileItineraryMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<MobileItineraryMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/itinerary`,
      input,
      options,
    );
  }

  updateItineraryItem(
    tripId: string,
    itemId: string,
    input: MobileItineraryMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<MobileItineraryMutationResponse>(
      `/api/mobile/v1/itinerary/${encodeURIComponent(itemId)}`,
      { ...input, tripId },
      options,
    );
  }

  deleteItineraryItem(
    tripId: string,
    itemId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ deleted: true; itemId: string }>(
      `/api/mobile/v1/itinerary/${encodeURIComponent(itemId)}`,
      { tripId },
      options,
    );
  }

  uploadItineraryCover(
    tripId: string,
    itemId: string,
    input: MobileItineraryMutationInput,
    file: File,
    options: MobileApiJsonRequestOptions = {},
  ) {
    const { signal, headers, ...policy } = options;
    const formData = new FormData();
    formData.set("tripId", tripId);
    formData.set("input", JSON.stringify(input));
    formData.set("cover_upload_file", file);
    return this.requestJson<MobileItineraryMutationResponse>(
      `/api/mobile/v1/itinerary/${encodeURIComponent(itemId)}/cover`,
      { method: "POST", headers, body: formData, signal },
      policy,
    );
  }

  createTrip(
    input: MobileTripMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<MobileTripMutationResponse>(
      "/api/mobile/v1/trips",
      input,
      options,
    );
  }

  updateTrip(
    tripId: string,
    input: MobileTripMutationInput,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<MobileTripMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      input,
      options,
    );
  }

  setTripArchived(
    tripId: string,
    archived: boolean,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<MobileTripMutationResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      { operation: archived ? "archive" : "restore" },
      options,
    );
  }

  deleteTrip(
    tripId: string,
    confirmation: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
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
    input: {
      inviteeIdentifier: string;
      consentConfirmed: boolean;
      legIds: string[];
    },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<{ invitationId: string }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/invitations`,
      input,
      options,
    );
  }

  cancelTripInvitation(
    tripId: string,
    invitationId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.deleteJson<{ cancelled: true }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/invitations`,
      { invitationId },
      options,
    );
  }

  removeTripMember(
    tripId: string,
    memberUserId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
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
      : this.deleteJson<{ included: boolean }>(
          path,
          { familyMemberId },
          options,
        );
  }

  updateTripMemberScope(
    tripId: string,
    input: {
      tripMemberId: string;
      startDate: string;
      endDate: string;
      legIds: string[];
    },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ updated: true }>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}/members`,
      input,
      options,
    );
  }

  uploadTripCover(
    tripId: string,
    file: File,
    options: MobileApiJsonRequestOptions = {},
  ) {
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
    input: {
      firstName: string;
      lastName: string;
      username: string;
      email: string;
    },
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<MobileAccountResponse>(
      "/api/mobile/v1/me",
      input,
      options,
    );
  }

  uploadAvatar(file: File, options: MobileApiJsonRequestOptions = {}) {
    const { signal, headers, ...policy } = options;
    const formData = new FormData();
    formData.set("avatar", file);
    return this.requestJson<{ avatarUrl: string }>(
      "/api/mobile/v1/me/avatar",
      { method: "POST", headers, body: formData, signal },
      policy,
    );
  }

  getSocialProfile(signal?: AbortSignal) {
    return this.getJson<MobileSocialProfileResponse>(
      "/api/mobile/v1/me/social",
      { signal },
    );
  }

  mutateFriend(
    input: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<Record<string, unknown>>(
      "/api/mobile/v1/friends",
      input,
      options,
    );
  }

  getFriendProfile(userId: string, signal?: AbortSignal) {
    return this.getJson<MobileFriendProfileResponse>(
      `/api/mobile/v1/friends/${encodeURIComponent(userId)}`,
      { signal },
    );
  }

  mutateFriendProfile(
    userId: string,
    input: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.postJson<Record<string, unknown>>(
      `/api/mobile/v1/friends/${encodeURIComponent(userId)}`,
      input,
      options,
    );
  }

  mutateWishlist(
    input: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    if (input.operation === "delete")
      return this.deleteJson<Record<string, unknown>>(
        "/api/mobile/v1/me/wishlist",
        input,
        options,
      );
    if (input.id)
      return this.patchJson<Record<string, unknown>>(
        "/api/mobile/v1/me/wishlist",
        input,
        options,
      );
    return this.postJson<Record<string, unknown>>(
      "/api/mobile/v1/me/wishlist",
      input,
      options,
    );
  }

  updateScratchMap(
    countryCode: string,
    scratched: boolean,
    options: MobileApiJsonRequestOptions = {},
  ) {
    return this.patchJson<{ countryCode: string; scratched: boolean }>(
      "/api/mobile/v1/me/scratch-map",
      { countryCode, scratched },
      options,
    );
  }

  mutatePassportStamp(
    input: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
    if (input.operation === "delete")
      return this.deleteJson<Record<string, unknown>>(
        "/api/mobile/v1/me/passport-stamps",
        input,
        options,
      );
    if (input.id)
      return this.patchJson<Record<string, unknown>>(
        "/api/mobile/v1/me/passport-stamps",
        input,
        options,
      );
    return this.postJson<Record<string, unknown>>(
      "/api/mobile/v1/me/passport-stamps",
      input,
      options,
    );
  }

  confirmAccount(options: MobileApiJsonRequestOptions = {}) {
    return this.postJson<{ confirmed: boolean }>(
      "/api/mobile/v1/me/confirmation",
      {},
      options,
    );
  }

  getSettings(signal?: AbortSignal) {
    return this.getJson<MobileSettingsResponse>("/api/mobile/v1/settings", {
      signal,
    });
  }

  updateSettings(
    input: Record<string, unknown>,
    options: MobileApiJsonRequestOptions = {},
  ) {
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
    return this.postJson<{
      exportId: string;
      status: string;
      expiresAt?: string;
    }>("/api/mobile/v1/data-exports", {}, options);
  }

  getDataExportDownload(
    exportId: string,
    options: MobileApiJsonRequestOptions = {},
  ) {
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
