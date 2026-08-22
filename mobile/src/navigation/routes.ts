export const MOBILE_ROUTE_STORAGE_KEY = "vaivia.mobile.route.v1";
export const MOBILE_HISTORY_STATE_KEY = "__vaiviaMobile";

export const MOBILE_TRIP_VIEWS = [
  "overview",
  "itinerary",
  "ideas",
  "budget",
  "transport",
  "food",
  "stays",
  "assistant",
  "health-safety",
] as const;

export type MobileTripView = (typeof MOBILE_TRIP_VIEWS)[number];

export type MobileRoute =
  | {
      name: "auth";
      view: "login" | "signup" | "confirm-email" | "forgot-password" | "update-password";
      email?: string;
    }
  | { name: "home" }
  | { name: "trips" }
  | { name: "notifications" }
  | { name: "profile" }
  | { name: "settings"; section?: string }
  | { name: "events" }
  | { name: "event"; eventId: string }
  | {
      name: "trip";
      tripId: string;
      view: MobileTripView;
      itemId?: string;
    };

export type MobileHistoryEntry = {
  depth: number;
  stackId: string;
  route: MobileRoute;
};

export const DEFAULT_MOBILE_ROUTE = { name: "home" } as const satisfies MobileRoute;
export const MOBILE_AUTH_LOGIN_ROUTE = { name: "auth", view: "login" } as const satisfies MobileRoute;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function optionalString(value: unknown) {
  return isNonEmptyString(value) ? value : undefined;
}

export function createMobileStackId(): string {
  return globalThis.crypto?.randomUUID?.() || `mobile-${Date.now()}`;
}

export function isMobileTripView(value: unknown): value is MobileTripView {
  return (
    typeof value === "string" &&
    (MOBILE_TRIP_VIEWS as readonly string[]).includes(value)
  );
}

export function parseMobileRoute(value: unknown): MobileRoute | null {
  if (!isRecord(value)) return null;
  if (
    value.name === "auth" &&
    (value.view === "login" ||
      value.view === "signup" ||
      value.view === "confirm-email" ||
      value.view === "forgot-password" ||
      value.view === "update-password")
  ) {
    return { name: "auth", view: value.view, email: optionalString(value.email) };
  }
  if (value.name === "home") return { name: "home" };
  if (value.name === "trips") return { name: "trips" };
  if (value.name === "notifications") return { name: "notifications" };
  if (value.name === "profile") return { name: "profile" };
  if (value.name === "events") return { name: "events" };
  if (value.name === "settings") {
    return { name: "settings", section: optionalString(value.section) };
  }
  if (value.name === "event" && isNonEmptyString(value.eventId)) {
    return { name: "event", eventId: value.eventId };
  }
  if (
    value.name === "trip" &&
    isNonEmptyString(value.tripId) &&
    isMobileTripView(value.view)
  ) {
    return {
      name: "trip",
      tripId: value.tripId,
      view: value.view,
      itemId: optionalString(value.itemId),
    };
  }
  return null;
}

export function routesMatch(left: MobileRoute, right: MobileRoute) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isImplementedMobileRoute(route: MobileRoute) {
  return (
    route.name === "auth" ||
    route.name === "home" ||
    route.name === "trips" ||
    route.name === "notifications" ||
    route.name === "profile" ||
    route.name === "settings" ||
    route.name === "trip"
  );
}

export function mobileRouteToPath(route: MobileRoute) {
  switch (route.name) {
    case "auth":
      return route.email
        ? `/auth/${route.view}?email=${encodeURIComponent(route.email)}`
        : `/auth/${route.view}`;
    case "home":
      return "/";
    case "trips":
      return "/trips";
    case "notifications":
      return "/notifications";
    case "profile":
      return "/profile";
    case "settings":
      return route.section
        ? `/settings/${encodeURIComponent(route.section)}`
        : "/settings";
    case "events":
      return "/events";
    case "event":
      return `/events/${encodeURIComponent(route.eventId)}`;
    case "trip": {
      const base = `/trips/${encodeURIComponent(route.tripId)}/${route.view}`;
      return route.itemId ? `${base}/${encodeURIComponent(route.itemId)}` : base;
    }
  }
}

export function resolveMobilePath(pathname: string): MobileRoute | null {
  let parts: string[];
  try {
    parts = pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
  if (parts.length === 0) return { name: "home" };
  if (parts.length === 1) {
    return parseMobileRoute({ name: parts[0] });
  }
  if (parts[0] === "auth" && parts.length === 2) {
    return parseMobileRoute({ name: "auth", view: parts[1] });
  }
  if (parts[0] === "settings" && parts.length === 2) {
    return parseMobileRoute({ name: "settings", section: parts[1] });
  }
  if (parts[0] === "events" && parts.length === 2) {
    return parseMobileRoute({ name: "event", eventId: parts[1] });
  }
  if (parts[0] === "trips" && (parts.length === 3 || parts.length === 4)) {
    return parseMobileRoute({
      name: "trip",
      tripId: parts[1],
      view: parts[2],
      itemId: parts[3],
    });
  }
  return null;
}

export function readStoredMobileRoute(storage: Storage): MobileRoute {
  try {
    const value = storage.getItem(MOBILE_ROUTE_STORAGE_KEY);
    return value
      ? parseMobileRoute(JSON.parse(value)) || DEFAULT_MOBILE_ROUTE
      : DEFAULT_MOBILE_ROUTE;
  } catch {
    return DEFAULT_MOBILE_ROUTE;
  }
}

export function writeStoredMobileRoute(storage: Storage, route: MobileRoute) {
  try {
    storage.setItem(MOBILE_ROUTE_STORAGE_KEY, JSON.stringify(route));
  } catch {
    // A storage failure must not prevent navigation.
  }
}

export function clearStoredMobileRoute(storage: Storage) {
  try {
    storage.removeItem(MOBILE_ROUTE_STORAGE_KEY);
  } catch {
    // A storage failure must not prevent logout/reset.
  }
}

export function readMobileHistoryEntry(
  value: unknown,
): MobileHistoryEntry | null {
  if (!isRecord(value)) return null;
  const entry = value[MOBILE_HISTORY_STATE_KEY];
  if (!isRecord(entry)) return null;
  const route = parseMobileRoute(entry.route);
  if (
    !route ||
    typeof entry.depth !== "number" ||
    entry.depth < 0 ||
    !isNonEmptyString(entry.stackId)
  ) {
    return null;
  }
  return {
    depth: Math.floor(entry.depth),
    stackId: entry.stackId,
    route,
  };
}

export function createMobileHistoryState(
  currentState: unknown,
  entry: MobileHistoryEntry,
) {
  return {
    ...(isRecord(currentState) ? currentState : {}),
    [MOBILE_HISTORY_STATE_KEY]: entry,
  };
}
