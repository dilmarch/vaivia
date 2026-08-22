import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  updateRecoveredPassword: vi.fn(),
}));

vi.mock("@/mobile/src/auth/AuthProvider", () => ({
  useMobileAuth: () => auth,
}));

import { AuthScreen } from "@/mobile/src/screens/AuthScreens";

afterEach(() => cleanup());
beforeEach(() => {
  for (const mock of Object.values(auth)) mock.mockReset();
});

describe("mobile account auth screens", () => {
  it("shows invalid or expired callback errors safely", () => {
    render(
      <AuthScreen
        view="login"
        callbackError="This email link is invalid or has expired."
        onNavigate={vi.fn()}
        onAuthenticated={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("invalid or has expired");
  });

  it("logs in and signs out of the auth boundary", async () => {
    auth.signInWithPassword.mockResolvedValue(undefined);
    const onAuthenticated = vi.fn();
    render(<AuthScreen view="login" onNavigate={vi.fn()} onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith("alex@example.com", "password"));
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });

  it("requires consent and shows the email confirmation state after signup", async () => {
    auth.signUpWithPassword.mockResolvedValue("confirmation_required");
    const onNavigate = vi.fn();
    render(<AuthScreen view="signup" onNavigate={onNavigate} onAuthenticated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alex_trips" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong!9Password" } });
    fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "Strong!9Password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("accept the terms");
    fireEvent.click(screen.getByText(/I agree to VAIVIA/).closest("label")!.querySelector("input")!);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(auth.signUpWithPassword).toHaveBeenCalledOnce());
    expect(onNavigate).toHaveBeenCalledWith("confirm-email", "alex@example.com");
  });

  it("shows duplicate-email/signup failures without navigating", async () => {
    auth.signUpWithPassword.mockRejectedValue(new Error("User already registered"));
    const onNavigate = vi.fn();
    render(<AuthScreen view="signup" onNavigate={onNavigate} onAuthenticated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alex_trips" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong!9Password" } });
    fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "Strong!9Password" } });
    fireEvent.click(screen.getByText(/I agree to VAIVIA/).closest("label")!.querySelector("input")!);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already registered");
    expect(onNavigate).not.toHaveBeenCalledWith("confirm-email", expect.anything());
  });

  it("requests recovery and updates a recovered password", async () => {
    auth.requestPasswordRecovery.mockResolvedValue(undefined);
    const { rerender } = render(<AuthScreen view="forgot-password" onNavigate={vi.fn()} onAuthenticated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset email" }));
    expect(await screen.findByRole("status")).toHaveTextContent("recovery instructions");
    expect(auth.requestPasswordRecovery).toHaveBeenCalledWith("alex@example.com");

    auth.updateRecoveredPassword.mockResolvedValue(undefined);
    const onAuthenticated = vi.fn();
    rerender(<AuthScreen view="update-password" onNavigate={vi.fn()} onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await waitFor(() => expect(auth.updateRecoveredPassword).toHaveBeenCalledWith("new-password"));
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });
});
