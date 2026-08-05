import "server-only";

import { logAssistantDiagnostic } from "@/lib/ai/assistant-diagnostics";

export type AssistantTimingStage =
    | "authentication_and_trip_access"
    | "trip_context_database"
    | "initial_gemini_request"
    | "function_call_decision"
    | "google_places_request"
    | "follow_up_gemini_request"
    | "message_persistence"
    | "total_request";

export type AssistantTimingRecorder = {
    record: (stage: AssistantTimingStage, elapsedMs: number, metadata?: {
        iteration?: number;
        outcome?: string;
    }) => void;
    serverTimingHeader: () => string;
};

export function createAssistantTimingRecorder(
    onRecord?: (stage: AssistantTimingStage) => void
): AssistantTimingRecorder {
    const entries: Array<{ stage: AssistantTimingStage; elapsedMs: number }> = [];
    return {
        record(stage, elapsedMs, metadata = {}) {
            const safeElapsedMs = Math.max(0, Math.round(elapsedMs));
            entries.push({ stage, elapsedMs: safeElapsedMs });
            onRecord?.(stage);
            logAssistantDiagnostic({
                stage: "request_lifecycle",
                code: stage,
                elapsedMs: safeElapsedMs,
                ...(metadata.iteration !== undefined
                    ? { toolCallIteration: metadata.iteration }
                    : {}),
                ...(metadata.outcome ? { sanitizedError: metadata.outcome } : {}),
            });
        },
        serverTimingHeader() {
            return entries
                .map(({ stage, elapsedMs }, index) => `${stage}_${index};dur=${elapsedMs}`)
                .join(", ");
        },
    };
}

export async function measureAssistantStage<T>(
    recorder: AssistantTimingRecorder,
    stage: AssistantTimingStage,
    operation: () => PromiseLike<T>,
    metadata?: { iteration?: number; outcome?: string }
) {
    const startedAt = performance.now();
    try {
        return await operation();
    } finally {
        recorder.record(stage, performance.now() - startedAt, metadata);
    }
}
