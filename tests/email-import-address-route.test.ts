import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, createServiceRoleClient } = vi.hoisted(() => ({
    getUser: vi.fn(),
    createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceRoleClient,
}));

import { GET, POST } from "@/app/api/settings/email-import-address/route";

const requestKey = "10000000-0000-4000-8000-000000000001";

function request(body: Record<string, unknown>) {
    return new Request("http://localhost/api/settings/email-import-address", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    getUser.mockReset();
    createServiceRoleClient.mockReset();
    vi.stubEnv("EMAIL_IMPORT_DOMAIN", "inbound.example.com");
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("email-import address rotation API", () => {
    it("rejects an unauthenticated rotation before creating a service client", async () => {
        getUser.mockResolvedValue({ data: { user: null } });

        const response = await POST(
            request({ requestKey, deactivatePrevious: false }) as never
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
        expect(createServiceRoleClient).not.toHaveBeenCalled();
    });

    it("upgrades a legacy-only primary when an existing user loads settings", async () => {
        const authenticatedUserId = "20000000-0000-4000-8000-000000000002";
        getUser.mockResolvedValue({
            data: { user: { id: authenticatedUserId } },
        });

        const legacyRow = {
            id: "legacy-alias",
            user_id: authenticatedUserId,
            inbound_token: "a".repeat(48),
            is_active: true,
            is_primary: true,
            address_format: "legacy",
            request_key: null,
            created_at: "2026-07-19T00:00:00.000Z",
            rotated_at: null,
            retired_at: null,
        };
        const recognizableRow = {
            ...legacyRow,
            id: "recognizable-alias",
            inbound_token: "dill.abc123def456",
            address_format: "username",
            created_at: "2026-07-20T00:00:00.000Z",
        };

        const profileBuilder = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { username: "dill" },
                error: null,
            }),
        };
        profileBuilder.eq.mockReturnValue(profileBuilder);

        let addressListRead = 0;
        const addressBuilder = {
            eq: vi.fn(),
            order: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (
                resolve: (value: { data: unknown[]; error: null }) => unknown
            ) => {
                const data =
                    addressListRead++ === 0
                        ? [legacyRow]
                        : [recognizableRow, { ...legacyRow, is_primary: false }];
                return Promise.resolve({ data, error: null }).then(resolve);
            },
        };
        addressBuilder.eq.mockReturnValue(addressBuilder);
        addressBuilder.order.mockReturnValue(addressBuilder);

        const rpc = vi.fn().mockResolvedValue({
            data: recognizableRow,
            error: null,
        });
        createServiceRoleClient.mockReturnValue({
            from: vi.fn((table: string) => ({
                select: vi.fn(() =>
                    table === "user_profiles" ? profileBuilder : addressBuilder
                ),
            })),
            rpc,
        });

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith(
            "rotate_user_email_import_address",
            expect.objectContaining({
                target_user_id: authenticatedUserId,
                deactivate_previous: false,
                request_key: null,
            })
        );
        expect(body.primary).toMatchObject({
            address: "dill.abc123def456@inbound.example.com",
            isPrimary: true,
            addressFormat: "username",
        });
        expect(body.addresses).toHaveLength(2);
        expect(body.addresses[1]).toMatchObject({
            isActive: true,
            isPrimary: false,
            addressFormat: "legacy",
        });
    });

    it("routes rotation ownership only from the authenticated UUID", async () => {
        const authenticatedUserId = "20000000-0000-4000-8000-000000000002";
        getUser.mockResolvedValue({
            data: { user: { id: authenticatedUserId } },
        });

        const addressRow = {
            id: "alias-id",
            user_id: authenticatedUserId,
            inbound_token: "dill.abc123def456",
            is_active: true,
            is_primary: true,
            address_format: "username",
            request_key: requestKey,
            created_at: "2026-07-20T00:00:00.000Z",
            rotated_at: null,
            retired_at: null,
        };

        const profileBuilder = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: { username: "dill" },
                error: null,
            }),
        };
        profileBuilder.eq.mockReturnValue(profileBuilder);

        const addressBuilder = {
            eq: vi.fn(),
            order: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (
                resolve: (value: { data: unknown[]; error: null }) => unknown
            ) => Promise.resolve({ data: [addressRow], error: null }).then(resolve),
        };
        addressBuilder.eq.mockReturnValue(addressBuilder);
        addressBuilder.order.mockReturnValue(addressBuilder);

        const rpc = vi.fn().mockResolvedValue({ data: addressRow, error: null });
        createServiceRoleClient.mockReturnValue({
            from: vi.fn((table: string) => ({
                select: vi.fn(() =>
                    table === "user_profiles" ? profileBuilder : addressBuilder
                ),
            })),
            rpc,
        });

        const response = await POST(
            request({
                requestKey,
                deactivatePrevious: false,
                userId: "attacker-controlled-id",
            }) as never
        );

        expect(response.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith(
            "rotate_user_email_import_address",
            expect.objectContaining({
                target_user_id: authenticatedUserId,
                deactivate_previous: false,
                request_key: requestKey,
            })
        );
        expect(rpc).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ target_user_id: "attacker-controlled-id" })
        );
    });
});
