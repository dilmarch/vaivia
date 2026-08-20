import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthProvider,
  useMobileAuth,
} from "@/mobile/src/auth/AuthProvider";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/mobile/src/lib/supabase", () => ({
  getMobileSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
  registerMobileAuthLifecycle: () => vi.fn(),
}));

function AuthProbe() {
  const { session, isInitializing, signInWithPassword } = useMobileAuth();

  return (
    <div>
      <span>{isInitializing ? "initializing" : "ready"}</span>
      <span>{session?.user.id || "no-user"}</span>
      <span>{session?.access_token ? "token-present" : "no-token"}</span>
      <button
        type="button"
        onClick={() =>
          void signInWithPassword("user@example.com", "super-secret-value")
        }
      >
        Sign in
      </button>
    </div>
  );
}

describe("mobile AuthProvider", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.signInWithPassword.mockReset();
    mocks.signOut.mockReset();
  });

  it("publishes the valid session returned by password sign-in immediately", async () => {
    const session = {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      expires_at: 1_900_000_000,
      token_type: "bearer",
      user: { id: "user-123" },
    } as Session;
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.signInWithPassword.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await screen.findByText("ready");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("user-123")).toBeInTheDocument();
      expect(screen.getByText("token-present")).toBeInTheDocument();
    });

    const diagnostics = JSON.stringify(log.mock.calls);
    expect(diagnostics).toContain("PASSWORD_SIGN_IN_COMPLETE");
    expect(diagnostics).toContain("user-123");
    expect(diagnostics).not.toContain("test-access-token");
    expect(diagnostics).not.toContain("test-refresh-token");
    expect(diagnostics).not.toContain("super-secret-value");
  });
});
