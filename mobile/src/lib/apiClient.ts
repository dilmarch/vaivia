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

type MobileApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImplementation?: typeof fetch;
};

export class MobileApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: MobileApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImplementation = options.fetchImplementation || fetch;
  }

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new MobileApiError("Your session has expired. Please sign in again.", 401);
    }

    const response = await this.fetchImplementation(
      `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal,
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | MobileApiErrorResponse
        | null;
      throw new MobileApiError(
        body?.error || `VAIVIA request failed (${response.status}).`,
        response.status,
      );
    }

    return (await response.json()) as T;
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
