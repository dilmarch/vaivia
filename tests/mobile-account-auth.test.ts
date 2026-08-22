import { describe, expect, it } from "vitest";
import {
  getSignupPasswordCriteria,
  getSignupPasswordValidationError,
} from "@/lib/account/authValidation";
import {
  MOBILE_CONFIRM_CALLBACK_URL,
  MOBILE_RECOVERY_CALLBACK_URL,
  parseMobileAuthCallbackUrl,
} from "@/mobile/src/auth/AuthProvider";

describe("mobile account authentication rules", () => {
  it("uses the same signup password requirements as web", () => {
    expect(
      getSignupPasswordValidationError({
        password: "weak",
        email: "alex@example.com",
        username: "alex",
      }),
    ).toBe("Password must be at least 8 characters.");
    expect(
      getSignupPasswordValidationError({
        password: "Strong!9Password",
        email: "alex@example.com",
        username: "traveller",
      }),
    ).toBe("");
    expect(
      getSignupPasswordCriteria({
        password: "Strong!9Password",
        email: "alex@example.com",
        username: "traveller",
      }).every((criterion) => criterion.met),
    ).toBe(true);
  });

  it("recognizes only complete VAIVIA confirmation and recovery callbacks", () => {
    expect(parseMobileAuthCallbackUrl(`${MOBILE_CONFIRM_CALLBACK_URL}?code=confirm-code`)).toEqual({
      kind: "confirmation",
      code: "confirm-code",
      errorMessage: null,
    });
    expect(parseMobileAuthCallbackUrl(`${MOBILE_RECOVERY_CALLBACK_URL}?code=recovery-code`)).toEqual({
      kind: "recovery",
      code: "recovery-code",
      errorMessage: null,
    });
    expect(parseMobileAuthCallbackUrl(`${MOBILE_RECOVERY_CALLBACK_URL}?error=expired`)).toEqual({
      kind: "recovery",
      code: null,
      errorMessage: "expired",
    });
    expect(parseMobileAuthCallbackUrl("https://evil.example/auth/recovery?code=secret")).toBeNull();
  });
});
