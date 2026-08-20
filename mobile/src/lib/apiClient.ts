import type {
  MobileApiErrorResponse,
  MobileTripDetailResponse,
  MobileTripsResponse,
} from "@/lib/mobileApi/contracts";

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
};

export class MobileApiClient {
  private readonly baseUrl: string;
  private readonly getAuthState: MobileApiClientOptions["getAuthState"];
  private readonly fetchImplementation: typeof fetch;

  constructor(options: MobileApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getAuthState = options.getAuthState;
    this.fetchImplementation = options.fetchImplementation || fetch;
  }

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
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
      throw new MobileApiError("Your session has expired. Please sign in again.", 401);
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal,
      });
    } catch (error) {
      console.error("[VAIVIA mobile API] response", {
        requestUrl,
        httpResponseStatus: null,
        apiResponseBody: {
          error: error instanceof Error ? error.message : "Network request failed",
        },
      });
      throw error;
    }

    const body = (await response.json().catch(() => null)) as
      | T
      | MobileApiErrorResponse
      | null;

    console.info("[VAIVIA mobile API] response", {
      requestUrl,
      httpResponseStatus: response.status,
      apiResponseBody: body,
    });

    if (!response.ok) {
      const errorBody = body as MobileApiErrorResponse | null;
      throw new MobileApiError(
        errorBody?.error || `VAIVIA request failed (${response.status}).`,
        response.status,
      );
    }

    return body as T;
  }

  getTrips(signal?: AbortSignal) {
    return this.request<MobileTripsResponse>("/api/mobile/v1/trips", signal);
  }

  getTrip(tripId: string, signal?: AbortSignal) {
    return this.request<MobileTripDetailResponse>(
      `/api/mobile/v1/trips/${encodeURIComponent(tripId)}`,
      signal,
    );
  }
}
