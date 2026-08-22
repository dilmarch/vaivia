import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MOBILE_ROUTE,
  clearStoredMobileRoute,
  createMobileHistoryState,
  createMobileStackId,
  readMobileHistoryEntry,
  readStoredMobileRoute,
  routesMatch,
  resolveMobileAppUrl,
  writeStoredMobileRoute,
  type MobileRoute,
} from "./routes";

type NavigateOptions = {
  replace?: boolean;
};

function getInitialRoute() {
  if (typeof window === "undefined") return DEFAULT_MOBILE_ROUTE;
  return (
    readMobileHistoryEntry(window.history.state)?.route ||
    readStoredMobileRoute(window.localStorage)
  );
}

export function useMobileRouter() {
  const [route, setRoute] = useState<MobileRoute>(getInitialRoute);
  const routeRef = useRef(route);
  const stackIdRef = useRef(createMobileStackId());

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const currentEntry = readMobileHistoryEntry(window.history.state);
    if (currentEntry) stackIdRef.current = currentEntry.stackId;
    const initialEntry = {
      depth: currentEntry?.depth || 0,
      stackId: stackIdRef.current,
      route: currentEntry?.route || routeRef.current,
    };
    window.history.replaceState(
      createMobileHistoryState(window.history.state, initialEntry),
      "",
    );
    writeStoredMobileRoute(window.localStorage, initialEntry.route);

    function handlePopState(event: PopStateEvent) {
      const entry = readMobileHistoryEntry(event.state);
      if (!entry || entry.stackId !== stackIdRef.current) {
        const fallbackEntry = {
          depth: 0,
          stackId: stackIdRef.current,
          route: DEFAULT_MOBILE_ROUTE,
        };
        window.history.replaceState(
          createMobileHistoryState(event.state, fallbackEntry),
          "",
        );
        routeRef.current = DEFAULT_MOBILE_ROUTE;
        setRoute(DEFAULT_MOBILE_ROUTE);
        writeStoredMobileRoute(window.localStorage, DEFAULT_MOBILE_ROUTE);
        return;
      }
      routeRef.current = entry.route;
      setRoute(entry.route);
      writeStoredMobileRoute(window.localStorage, entry.route);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback(
    (nextRoute: MobileRoute, options: NavigateOptions = {}) => {
      if (routesMatch(routeRef.current, nextRoute)) return;
      const currentEntry = readMobileHistoryEntry(window.history.state);
      const nextEntry = {
        depth: options.replace
          ? currentEntry?.depth || 0
          : (currentEntry?.depth || 0) + 1,
        stackId: stackIdRef.current,
        route: nextRoute,
      };
      const nextState = createMobileHistoryState(
        window.history.state,
        nextEntry,
      );
      if (options.replace) {
        window.history.replaceState(nextState, "");
      } else {
        window.history.pushState(nextState, "");
      }
      routeRef.current = nextRoute;
      setRoute(nextRoute);
      writeStoredMobileRoute(window.localStorage, nextRoute);
    },
    [],
  );

  const replace = useCallback(
    (nextRoute: MobileRoute) => navigate(nextRoute, { replace: true }),
    [navigate],
  );

  const reset = useCallback((rootRoute: MobileRoute = DEFAULT_MOBILE_ROUTE) => {
    stackIdRef.current = createMobileStackId();
    const nextEntry = {
      depth: 0,
      stackId: stackIdRef.current,
      route: rootRoute,
    };
    clearStoredMobileRoute(window.localStorage);
    window.history.replaceState(
      createMobileHistoryState(window.history.state, nextEntry),
      "",
    );
    routeRef.current = rootRoute;
    setRoute(rootRoute);
    writeStoredMobileRoute(window.localStorage, rootRoute);
  }, []);

  const goBack = useCallback(
    (fallback: MobileRoute = DEFAULT_MOBILE_ROUTE) => {
      const currentEntry = readMobileHistoryEntry(window.history.state);
      if (
        currentEntry?.stackId === stackIdRef.current &&
        currentEntry.depth > 0
      ) {
        window.history.back();
      } else {
        replace(fallback);
      }
    },
    [replace],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: PluginListenerHandle | null = null;
    let disposed = false;

    void CapacitorApp.addListener("backButton", () => goBack()).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listener = handle;
      }
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [goBack]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: PluginListenerHandle | null = null;
    let disposed = false;
    void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      const callbackRoute = resolveMobileAppUrl(url);
      if (callbackRoute) {
        if (callbackRoute.name === "event-checkout") {
          void Browser.close().catch(() => undefined);
        }
        navigate(callbackRoute);
      }
    }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [navigate]);

  return { route, push: navigate, replace, back: goBack, reset };
}
