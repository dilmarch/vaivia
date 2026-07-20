import { afterEach, describe, expect, it } from "vitest";

import {
  getLocalTimezone,
  readSessionTimezone,
  SESSION_TIMEZONE_STORAGE_KEY,
  writeSessionTimezone,
} from "@/lib/sessionTimezone";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("session display timezone", () => {
  it("remembers a selected timezone for the current browser session", () => {
    expect(writeSessionTimezone("America/Toronto")).toBe(true);
    expect(readSessionTimezone()).toBe("America/Toronto");
  });

  it("falls back to local time when the session has no selection", () => {
    expect(readSessionTimezone()).toBeNull();
    expect(getLocalTimezone()).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it("discards invalid stored timezone values", () => {
    window.sessionStorage.setItem(
      SESSION_TIMEZONE_STORAGE_KEY,
      "Not/A_Timezone",
    );

    expect(readSessionTimezone()).toBeNull();
    expect(
      window.sessionStorage.getItem(SESSION_TIMEZONE_STORAGE_KEY),
    ).toBeNull();
  });
});
