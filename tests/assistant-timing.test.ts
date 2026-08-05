import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/assistant-diagnostics", () => ({
    logAssistantDiagnostic: log,
}));

import {
    createAssistantTimingRecorder,
    measureAssistantStage,
} from "@/lib/ai/assistant-timing";

describe("assistant timing instrumentation", () => {
    beforeEach(() => log.mockClear());

    it("records lifecycle stages without network-duration thresholds", async () => {
        const timing = createAssistantTimingRecorder();
        await expect(
            measureAssistantStage(timing, "trip_context_database", async () => "ok")
        ).resolves.toBe("ok");
        timing.record("total_request", 12.4);

        expect(log).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                stage: "request_lifecycle",
                code: "trip_context_database",
                elapsedMs: expect.any(Number),
            })
        );
        expect(log).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                code: "total_request",
                elapsedMs: 12,
            })
        );
    });

    it("records a failed stage in finally and rethrows", async () => {
        const timing = createAssistantTimingRecorder();
        await expect(
            measureAssistantStage(timing, "message_persistence", async () => {
                throw new Error("synthetic");
            })
        ).rejects.toThrow("synthetic");
        expect(log).toHaveBeenCalledWith(
            expect.objectContaining({ code: "message_persistence" })
        );
    });
});
