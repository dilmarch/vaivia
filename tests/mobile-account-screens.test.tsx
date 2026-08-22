import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";

vi.mock("@/mobile/src/auth/AuthProvider", () => ({
  useMobileAuth: () => ({ updateRecoveredPassword: vi.fn() }),
}));

import { ProfileScreen } from "@/mobile/src/screens/ProfileScreen";
import { SettingsScreen } from "@/mobile/src/screens/SettingsScreen";

afterEach(() => cleanup());

const profile = {
  id: "user-1",
  firstName: "Alex",
  lastName: "Rivera",
  username: "alex",
  email: "alex@example.com",
  avatarUrl: null,
  joinedAt: "2026-01-01T00:00:00Z",
  role: "basic_user",
  termsAcceptedAt: "2026-01-01T00:00:00Z",
  marketingEmailsConsent: false,
  accountDeletionRequestedAt: null,
  points: 120,
  level: 2,
  levelName: "Traveller",
  canChangeEmail: true,
};

const settings = {
  preferences: {
    themeMode: "dark",
    countdownDisplayMode: "days",
    clockFormat: "12h",
    defaultTimeZone: null,
    itineraryDefaultView: "list",
    newsFeedMode: "integrated",
    homeCurrency: "CAD",
    marketingEmailsConsent: false,
  },
  notificationPreferences: [],
  categories: [],
  familyMembers: [],
  capabilities: {
    profileEditing: true,
    passwordChange: true,
    avatarUpload: false,
    notificationMutation: false,
    categoryMutation: false,
    familyMutation: false,
  },
};

describe("mobile profile and settings", () => {
  it("loads and safely edits the authenticated profile", async () => {
    const apiClient = {
      getAccount: vi.fn().mockResolvedValue({ profile }),
      updateAccount: vi.fn().mockResolvedValue({ profile: { ...profile, firstName: "Alexa" } }),
    } as unknown as MobileApiClient;
    render(<ProfileScreen apiClient={apiClient} onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Alexa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile details" }));
    await waitFor(() => expect(apiClient.updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Alexa", username: "alex" }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("Profile details saved");
  });

  it("requests export and confirms deletion before clearing the session", async () => {
    const apiClient = {
      getSettings: vi.fn().mockResolvedValue(settings),
      getDataExports: vi.fn().mockResolvedValue({ exports: [] }),
      requestDataExport: vi.fn().mockResolvedValue({ exportId: "export-1", status: "ready" }),
      requestAccountDeletion: vi.fn().mockResolvedValue({ requestedAt: "2026-08-22T00:00:00Z" }),
    } as unknown as MobileApiClient;
    const onAccountClosed = vi.fn().mockResolvedValue(undefined);
    render(<SettingsScreen apiClient={apiClient} section="data" onSection={vi.fn()} onProfile={vi.fn()} onAccountClosed={onAccountClosed} />);
    expect(await screen.findByRole("heading", { name: "Data and privacy" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(apiClient.requestDataExport).toHaveBeenCalledOnce());
    const deletionButton = screen.getByRole("button", { name: "Request account deletion" });
    expect(deletionButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT"), { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(deletionButton);
    await waitFor(() => expect(apiClient.requestAccountDeletion).toHaveBeenCalledWith(
      "DELETE MY ACCOUNT",
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    ));
    expect(onAccountClosed).toHaveBeenCalledOnce();
  });

  it("keeps the user signed in when deletion fails", async () => {
    const apiClient = {
      getSettings: vi.fn().mockResolvedValue(settings),
      getDataExports: vi.fn().mockResolvedValue({ exports: [] }),
      requestAccountDeletion: vi.fn().mockRejectedValue(new Error("Deletion request failed")),
    } as unknown as MobileApiClient;
    const onAccountClosed = vi.fn();
    render(<SettingsScreen apiClient={apiClient} section="data" onSection={vi.fn()} onProfile={vi.fn()} onAccountClosed={onAccountClosed} />);
    await screen.findByRole("heading", { name: "Data and privacy" });
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT"), { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(screen.getByRole("button", { name: "Request account deletion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deletion request failed");
    expect(onAccountClosed).not.toHaveBeenCalled();
  });
});
