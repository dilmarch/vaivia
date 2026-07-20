import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsEmailImportClient from "@/components/SettingsEmailImportClient";

const primary = {
    id: "primary-alias",
    address: "dill.abc123def456@inbound.example.com",
    isActive: true,
    isPrimary: true,
    addressFormat: "username" as const,
    createdAt: "2026-07-20T00:00:00.000Z",
    rotatedAt: null,
    retiredAt: null,
};

const previous = {
    id: "previous-alias",
    address: `${"trips+"}${"a".repeat(48)}@inbound.example.com`,
    isActive: true,
    isPrimary: false,
    addressFormat: "legacy" as const,
    createdAt: "2026-07-19T00:00:00.000Z",
    rotatedAt: "2026-07-20T00:00:00.000Z",
    retiredAt: null,
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        })
    );
}

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("email-import address settings", () => {
    it("shows primary and historical status and copies without exposing routing IDs", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                jsonResponse({
                    primary,
                    addresses: [primary, previous],
                    usernameRequired: false,
                })
            )
        );

        render(<SettingsEmailImportClient />);

        expect(await screen.findByText(primary.address)).toBeInTheDocument();
        expect(screen.getByText("Previous addresses")).toBeInTheDocument();
        expect(screen.getByText("Active · Primary")).toBeInTheDocument();
        expect(screen.getAllByText("Active")).toHaveLength(1);
        expect(screen.queryByText("private-user-id")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Copy" }));
        await waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                primary.address
            )
        );
        expect(screen.getByText("Forwarding address copied.")).toBeInTheDocument();
    });

    it("keeps the previous alias active by default and requires explicit deactivation", async () => {
        const requestKey = "10000000-0000-4000-8000-000000000001";
        vi.spyOn(window.crypto, "randomUUID").mockReturnValue(requestKey);
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() =>
                jsonResponse({
                    primary,
                    addresses: [primary],
                    usernameRequired: false,
                })
            )
            .mockImplementationOnce(() =>
                jsonResponse({
                    primary: { ...primary, id: "new-primary" },
                    addresses: [
                        { ...primary, id: "new-primary" },
                        { ...primary, isPrimary: false },
                    ],
                    usernameRequired: false,
                })
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<SettingsEmailImportClient />);
        fireEvent.click(
            await screen.findByRole("button", { name: "Rotate address" })
        );

        const deactivate = screen.getByRole("checkbox", {
            name: /deactivate the current address/i,
        });
        expect(deactivate).not.toBeChecked();
        expect(
            screen.getByText(/breaks forwarding rules and saved contacts/i)
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Create and keep old active" })
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(fetchMock).toHaveBeenLastCalledWith(
            "/api/settings/email-import-address",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    deactivatePrevious: false,
                    requestKey,
                }),
            })
        );
    });

    it("prompts for a username without replacing an existing alias", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                jsonResponse({
                    primary: previous,
                    addresses: [{ ...previous, isPrimary: true }],
                    usernameRequired: true,
                })
            )
        );

        render(<SettingsEmailImportClient />);

        expect(
            await screen.findByText(/choose a valid username before creating/i)
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Set username" })).toHaveAttribute(
            "href",
            "/settings?section=profile"
        );
        expect(screen.getByRole("button", { name: "Rotate address" })).toBeDisabled();
    });
});
