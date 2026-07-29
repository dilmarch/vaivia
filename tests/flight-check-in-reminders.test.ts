import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    getDefaultNotificationPreference,
    isKnownNotificationType,
} from "@/lib/notificationTypes";

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    processPush: vi.fn(),
    processEmail: vi.fn(),
    processExternalEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceRoleClient: () => ({
        rpc: mocks.rpc,
    }),
}));

vi.mock("@/lib/pushNotifications", () => ({
    processNotificationPushOutbox: mocks.processPush,
}));

vi.mock("@/lib/emailNotifications", () => ({
    processNotificationEmailOutbox: mocks.processEmail,
}));

vi.mock("@/lib/externalInviteEmails", () => ({
    processExternalInviteEmailOutbox: mocks.processExternalEmail,
}));

import { processNotificationQueues } from "@/lib/notificationQueueProcessor";

describe("flight check-in reminders", () => {
    beforeEach(() => {
        mocks.rpc.mockReset();
        mocks.processPush.mockReset();
        mocks.processEmail.mockReset();
        mocks.processExternalEmail.mockReset();

        mocks.rpc.mockImplementation(async (procedure: string) => ({
            data:
                procedure === "queue_due_flight_check_in_reminders"
                    ? 2
                    : 1,
            error: null,
        }));
        mocks.processPush.mockResolvedValue([]);
        mocks.processEmail.mockResolvedValue([]);
        mocks.processExternalEmail.mockResolvedValue([]);
    });

    it("defaults the new notification type on for every channel", () => {
        expect(isKnownNotificationType("flight_check_in_reminder")).toBe(true);
        expect(
            getDefaultNotificationPreference("flight_check_in_reminder")
        ).toEqual({
            notificationType: "flight_check_in_reminder",
            inAppEnabled: true,
            pushEnabled: true,
            emailEnabled: true,
        });
    });

    it("queues flight and accommodation reminders before processing channels", async () => {
        const result = await processNotificationQueues(25);

        expect(mocks.rpc).toHaveBeenCalledWith(
            "queue_due_accommodation_cancellation_reminders"
        );
        expect(mocks.rpc).toHaveBeenCalledWith(
            "queue_due_flight_check_in_reminders"
        );
        expect(result.remindersQueued).toBe(3);
        expect(result.ok).toBe(true);
    });

    it("continues processing delivery channels if one reminder query fails", async () => {
        mocks.rpc.mockImplementation(async (procedure: string) => {
            if (procedure === "queue_due_flight_check_in_reminders") {
                return { data: null, error: { message: "flight queue failed" } };
            }
            return { data: 1, error: null };
        });

        const result = await processNotificationQueues(25);

        expect(result.remindersQueued).toBe(1);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            { channel: "reminder", error: "flight queue failed" },
        ]);
        expect(mocks.processPush).toHaveBeenCalledWith(25);
        expect(mocks.processEmail).toHaveBeenCalledWith(25);
    });
});
