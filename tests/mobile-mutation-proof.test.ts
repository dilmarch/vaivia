import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

import {
  applyIsolatedMutation,
  executeIsolatedMutationProof,
  type IsolatedMutationRecord,
} from "@/lib/mobileApi/mutationProof";

const fixture: IsolatedMutationRecord = {
  id: "isolated-fixture-1",
  ownerUserId: "user-123",
  label: "Before",
  version: 1,
};

function mutationRequest(token = "fixture-access-token") {
  return new Request("https://vaivia.app/api/mobile/v1/test-fixture", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "capacitor://localhost",
    },
  });
}

describe("isolated mobile mutation proof", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
  });

  it("validates the bearer token, authorizes ownership, and returns typed data", async () => {
    const response = await executeIsolatedMutationProof(
      mutationRequest(),
      fixture,
      { label: "After", expectedVersion: 1 },
    );

    expect(mocks.getUser).toHaveBeenCalledWith("fixture-access-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "capacitor://localhost",
    );
    await expect(response.json()).resolves.toEqual({
      data: {
        record: { ...fixture, label: "After", version: 2 },
      },
    });
    expect(fixture).toEqual({
      id: "isolated-fixture-1",
      ownerUserId: "user-123",
      label: "Before",
      version: 1,
    });
  });

  it("rejects an authenticated non-owner without mutating the fixture", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "different-user" } },
      error: null,
    });
    const response = await executeIsolatedMutationProof(
      mutationRequest(),
      fixture,
      { label: "Unauthorized change", expectedVersion: 1 },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You do not have access to this record.",
      code: "forbidden",
      message: "You do not have access to this record.",
    });
    expect(fixture.label).toBe("Before");
  });

  it("returns safe validation and conflict envelopes", () => {
    expect(
      applyIsolatedMutation("user-123", fixture, {
        label: " ",
        expectedVersion: 1,
      }),
    ).toEqual({
      ok: false,
      status: 422,
      code: "validation_error",
      message: "Please correct the highlighted fields.",
      fieldErrors: { label: ["Label is required."] },
    });
    expect(
      applyIsolatedMutation("user-123", fixture, {
        label: "After",
        expectedVersion: 0,
      }),
    ).toMatchObject({ ok: false, status: 409, code: "conflict" });
  });

  it("rejects requests without a bearer token before domain execution", async () => {
    const response = await executeIsolatedMutationProof(
      new Request("https://vaivia.app/api/mobile/v1/test-fixture", {
        method: "POST",
        headers: { Origin: "capacitor://localhost" },
      }),
      fixture,
      { label: "After", expectedVersion: 1 },
    );

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
      code: "unauthorized",
    });
  });

  it("advertises mutation-safe CORS request headers", async () => {
    const response = await executeIsolatedMutationProof(
      mutationRequest(),
      fixture,
      { label: "After", expectedVersion: 1 },
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Idempotency-Key",
    );
  });
});
