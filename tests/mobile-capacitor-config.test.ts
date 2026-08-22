import { describe, expect, it } from "vitest";
import capacitorConfig from "@/capacitor.config";

describe("Capacitor iOS configuration", () => {
  it("uses the local mobile bundle with the required VAIVIA identifier", () => {
    expect(capacitorConfig.appId).toBe("com.dreamhaus.vaivia");
    expect(capacitorConfig.webDir).toBe("mobile/dist");
    expect(capacitorConfig.server?.url).toBeUndefined();
  });

  it("keeps native plugins limited to lifecycle and secure hosted checkout", () => {
    expect(capacitorConfig.ios?.includePlugins).toEqual([
      "@capacitor/app",
      "@capacitor/browser",
    ]);
  });
});
