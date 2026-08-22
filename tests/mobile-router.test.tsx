import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MOBILE_ROUTE,
  MOBILE_HISTORY_STATE_KEY,
  MOBILE_ROUTE_STORAGE_KEY,
  createMobileHistoryState,
  mobileRouteToPath,
  parseMobileRoute,
  readMobileHistoryEntry,
  readStoredMobileRoute,
  resolveMobilePath,
} from "@/mobile/src/navigation/routes";
import { useMobileRouter } from "@/mobile/src/navigation/useMobileRouter";

describe("mobile route model", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "");
  });

  it("accepts only supported, complete routes", () => {
    expect(parseMobileRoute({ name: "trips" })).toEqual({ name: "trips" });
    expect(
      parseMobileRoute({ name: "trip", tripId: "trip-1", view: "budget" }),
    ).toEqual({ name: "trip", tripId: "trip-1", view: "budget" });
    expect(parseMobileRoute({ name: "trip", tripId: "", view: "budget" })).toBe(
      null,
    );
    expect(
      parseMobileRoute({ name: "trip", tripId: "trip-1", view: "unknown" }),
    ).toBe(null);
    expect(parseMobileRoute({ name: "admin" })).toBe(null);
    expect(parseMobileRoute({ name: "profile" })).toEqual({ name: "profile" });
    expect(parseMobileRoute({ name: "auth", view: "forgot-password" })).toEqual({
      name: "auth",
      view: "forgot-password",
      email: undefined,
    });
    expect(parseMobileRoute({ name: "settings", section: "security" })).toEqual(
      { name: "settings", section: "security" },
    );
    expect(parseMobileRoute({ name: "event", eventId: "event-1" })).toEqual({
      name: "event",
      eventId: "event-1",
    });
  });

  it("round-trips future deep-link paths through the route representation", () => {
    const itemRoute = {
      name: "trip" as const,
      tripId: "trip/id",
      view: "itinerary" as const,
      itemId: "item/id",
    };
    expect(resolveMobilePath(mobileRouteToPath(itemRoute))).toEqual(itemRoute);
    expect(resolveMobilePath("/events/event%2Fone")).toEqual({
      name: "event",
      eventId: "event/one",
    });
    expect(resolveMobilePath("/unsupported/path")).toBe(null);
    expect(resolveMobilePath("/trips/%/overview")).toBe(null);
  });

  it("falls back safely when persisted route data is malformed", () => {
    window.localStorage.setItem(MOBILE_ROUTE_STORAGE_KEY, "not-json");
    expect(readStoredMobileRoute(window.localStorage)).toEqual(
      DEFAULT_MOBILE_ROUTE,
    );

    expect(
      readMobileHistoryEntry({
        [MOBILE_HISTORY_STATE_KEY]: {
          depth: -1,
          stackId: "stack-1",
          route: { name: "notifications" },
        },
      }),
    ).toBe(null);
  });
});

describe("useMobileRouter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "");
  });

  it("restores the last valid screen and installs it as the current entry", () => {
    const storedRoute = {
      name: "trip" as const,
      tripId: "trip-1",
      view: "itinerary" as const,
    };
    window.localStorage.setItem(
      MOBILE_ROUTE_STORAGE_KEY,
      JSON.stringify(storedRoute),
    );

    const { result } = renderHook(() => useMobileRouter());

    expect(result.current.route).toEqual(storedRoute);
    expect(readMobileHistoryEntry(window.history.state)).toEqual({
      depth: 0,
      stackId: expect.any(String),
      route: storedRoute,
    });
  });

  it("pushes typed navigation entries and responds to browser history", () => {
    const { result } = renderHook(() => useMobileRouter());

    act(() => {
      result.current.push({ name: "notifications" });
    });
    expect(result.current.route).toEqual({ name: "notifications" });
    expect(readMobileHistoryEntry(window.history.state)).toEqual({
      depth: 1,
      stackId: expect.any(String),
      route: { name: "notifications" },
    });
    expect(JSON.parse(window.localStorage.getItem(MOBILE_ROUTE_STORAGE_KEY)!)).toEqual(
      { name: "notifications" },
    );

    const previousState = createMobileHistoryState(window.history.state, {
      depth: 0,
      stackId: readMobileHistoryEntry(window.history.state)!.stackId,
      route: DEFAULT_MOBILE_ROUTE,
    });
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: previousState }),
      );
    });

    expect(result.current.route).toEqual(DEFAULT_MOBILE_ROUTE);
  });

  it("uses a safe fallback when there is no prior in-app history entry", () => {
    const tripRoute = {
      name: "trip" as const,
      tripId: "trip-1",
      view: "overview" as const,
    };
    window.history.replaceState(
      createMobileHistoryState(null, {
        depth: 0,
        stackId: "stack-1",
        route: tripRoute,
      }),
      "",
    );
    const { result } = renderHook(() => useMobileRouter());

    act(() => {
      result.current.back(DEFAULT_MOBILE_ROUTE);
    });

    expect(result.current.route).toEqual(DEFAULT_MOBILE_ROUTE);
    expect(readMobileHistoryEntry(window.history.state)).toEqual({
      depth: 0,
      stackId: "stack-1",
      route: DEFAULT_MOBILE_ROUTE,
    });
  });

  it("reset clears the authenticated back stack and persisted destination", () => {
    const { result } = renderHook(() => useMobileRouter());
    act(() => {
      result.current.push({
        name: "trip",
        tripId: "trip-1",
        view: "budget",
      });
    });
    const previousStackId = readMobileHistoryEntry(window.history.state)!.stackId;

    act(() => {
      result.current.reset(DEFAULT_MOBILE_ROUTE);
    });

    const resetEntry = readMobileHistoryEntry(window.history.state)!;
    expect(result.current.route).toEqual(DEFAULT_MOBILE_ROUTE);
    expect(resetEntry.depth).toBe(0);
    expect(resetEntry.stackId).not.toBe(previousStackId);
    expect(readStoredMobileRoute(window.localStorage)).toEqual(
      DEFAULT_MOBILE_ROUTE,
    );

    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: createMobileHistoryState(null, {
            depth: 1,
            stackId: previousStackId,
            route: {
              name: "trip",
              tripId: "trip-1",
              view: "budget",
            },
          }),
        }),
      );
    });
    expect(result.current.route).toEqual(DEFAULT_MOBILE_ROUTE);
  });
});
