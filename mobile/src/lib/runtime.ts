import { Capacitor } from "@capacitor/core";

export function initializeMobileRuntime() {
  document.documentElement.dataset.vaiviaRuntime = Capacitor.isNativePlatform()
    ? "capacitor"
    : "mobile-browser";

  // The native app is a separate local bundle. It must never inherit the web
  // application's PWA install or Web Push service worker behavior.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch(() => undefined);
  }
}
