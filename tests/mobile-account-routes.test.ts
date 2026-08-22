import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  loadAccount: vi.fn(),
  updateAccountProfile: vi.fn(),
  loadSettings: vi.fn(),
  updateSettings: vi.fn(),
  requestDeletion: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", () => ({
  authenticateMobileRequest: mocks.authenticate,
  mobileSuccess: (_request: Request, data: unknown, init: ResponseInit = {}) => Response.json({ data }, init),
  mobileError: (_request: Request, options: { status: number; code: string; message: string; fieldErrors?: unknown }) => Response.json({ error: options.message, code: options.code, message: options.message, ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}) }, { status: options.status }),
  mobileOptions: () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/account/accountDomain", () => {
  class AccountDomainError extends Error {
    constructor(message: string, readonly code: string, readonly status = 400, readonly fieldErrors?: unknown) { super(message); }
  }
  return {
    AccountDomainError,
    loadAccount: mocks.loadAccount,
    updateAccountProfile: mocks.updateAccountProfile,
    loadSettings: mocks.loadSettings,
    updateSettings: mocks.updateSettings,
    requestAccountDeletion: mocks.requestDeletion,
  };
});

import { GET as getMe, PATCH as patchMe } from "@/app/api/mobile/v1/me/route";
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/mobile/v1/settings/route";
import { POST as deleteAccount } from "@/app/api/mobile/v1/account/deletion/route";

const context = { user: { id: "user-1" }, supabase: { marker: true } };
function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://vaivia.app${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "capacitor://localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("mobile account routes", () => {
  beforeEach(() => {
    mocks.authenticate.mockReset().mockResolvedValue(context);
    mocks.loadAccount.mockReset().mockResolvedValue({ profile: { id: "user-1" } });
    mocks.updateAccountProfile.mockReset().mockResolvedValue({ profile: { id: "user-1", firstName: "Alex" } });
    mocks.loadSettings.mockReset().mockResolvedValue({ preferences: { themeMode: "dark" } });
    mocks.updateSettings.mockReset().mockResolvedValue({ preferences: { themeMode: "pink" } });
    mocks.requestDeletion.mockReset().mockResolvedValue({ requestedAt: "2026-08-22T00:00:00Z" });
  });

  it("loads and edits only the authenticated account", async () => {
    expect((await getMe(request("/api/mobile/v1/me"))).status).toBe(200);
    const response = await patchMe(request("/api/mobile/v1/me", "PATCH", { firstName: "Alex" }));
    expect(response.status).toBe(200);
    expect(mocks.updateAccountProfile).toHaveBeenCalledWith(
      context.supabase,
      context.user,
      { firstName: "Alex" },
      { emailRedirectTo: "com.dreamhaus.vaivia://auth/confirm" },
    );
  });

  it("loads and updates user-scoped settings", async () => {
    expect((await getSettings(request("/api/mobile/v1/settings"))).status).toBe(200);
    const response = await patchSettings(request("/api/mobile/v1/settings", "PATCH", { themeMode: "pink" }));
    expect(response.status).toBe(200);
    expect(mocks.updateSettings).toHaveBeenCalledWith(context.supabase, context.user, { themeMode: "pink" });
  });

  it("requires exact deletion confirmation and never calls the RPC otherwise", async () => {
    const rejected = await deleteAccount(request("/api/mobile/v1/account/deletion", "POST", { confirmation: "delete" }));
    expect(rejected.status).toBe(422);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
    const accepted = await deleteAccount(request("/api/mobile/v1/account/deletion", "POST", { confirmation: "DELETE MY ACCOUNT" }));
    expect(accepted.status).toBe(200);
    expect(mocks.requestDeletion).toHaveBeenCalledWith(context.supabase, "user-1");
  });

  it("preserves auth failures before account domain work", async () => {
    mocks.authenticate.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await getMe(request("/api/mobile/v1/me"));
    expect(response.status).toBe(401);
    expect(mocks.loadAccount).not.toHaveBeenCalled();
  });

  it("does not report deletion success when the domain operation fails", async () => {
    mocks.requestDeletion.mockRejectedValueOnce(new Error("rpc failed"));
    const response = await deleteAccount(
      request("/api/mobile/v1/account/deletion", "POST", {
        confirmation: "DELETE MY ACCOUNT",
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "account_operation_failed",
    });
  });
});
