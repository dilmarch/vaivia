export const SESSION_TIMEZONE_STORAGE_KEY = "vaivia.itinerary-display-timezone";

export function isSupportedTimezone(timezone: string) {
  if (!timezone.trim()) return false;

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function readSessionTimezone() {
  if (typeof window === "undefined") return null;

  try {
    const timezone = window.sessionStorage.getItem(
      SESSION_TIMEZONE_STORAGE_KEY,
    );
    if (!timezone) return null;
    if (isSupportedTimezone(timezone)) return timezone;

    window.sessionStorage.removeItem(SESSION_TIMEZONE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return null;
}

export function writeSessionTimezone(timezone: string) {
  if (typeof window === "undefined" || !isSupportedTimezone(timezone)) {
    return false;
  }

  try {
    window.sessionStorage.setItem(SESSION_TIMEZONE_STORAGE_KEY, timezone);
    return true;
  } catch {
    return false;
  }
}

export function getLocalTimezone() {
  if (typeof window === "undefined") return "UTC";

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return isSupportedTimezone(timezone) ? timezone : "UTC";
}
